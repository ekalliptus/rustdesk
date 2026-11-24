pub use self::vpxcodec::*;
use base::message_proto::{video_frame, Chroma, VideoFrame};
use hbb_common::{bail, log, ResultType};
use std::{ffi::c_void, slice};

cfg_if! {
    if #[cfg(quartz)] {
        mod quartz;
        pub use self::quartz::*;
    } else if #[cfg(x11)] {
        cfg_if! {
            if #[cfg(feature="wayland")] {
                mod linux;
                mod wayland;
                mod x11;
                #[cfg(all(target_os = "linux", feature = "drm"))]
                pub mod drmtap_dl;
                #[cfg(all(target_os = "linux", feature = "drm"))]
                pub mod drm_reader;
                #[cfg(all(target_os = "linux", feature = "drm"))]
                pub mod drm_render;
                pub use self::linux::*;
                pub use self::wayland::set_map_err;
                pub use self::x11::PixelBuffer;
            } else {
                mod x11;
                pub use self::x11::*;
            }
        }
    } else if #[cfg(dxgi)] {
        mod dxgi;
        pub use self::dxgi::*;
    } else if #[cfg(target_os = "android")] {
        mod android;
        pub use self::android::*;
    }else {
        //TODO: Fallback implementation.
    }
}

pub mod codec;
pub mod convert;
#[cfg(feature = "hwcodec")]
pub mod hwcodec;
#[cfg(feature = "mediacodec")]
pub mod mediacodec;
pub mod vpxcodec;
#[cfg(feature = "vram")]
pub mod vram;
pub use self::convert::*;
pub const STRIDE_ALIGN: usize = 64; // commonly used in libvpx vpx_img_alloc caller
pub const HW_STRIDE_ALIGN: usize = 0; // recommended by av_frame_get_buffer

pub mod aom;
#[cfg(not(any(target_os = "ios")))]
pub mod camera;
pub mod record;
mod vpx;

#[repr(usize)]
#[derive(Debug, Copy, Clone)]
pub enum ImageFormat {
    Raw,
    ABGR,
    ARGB,
}

#[repr(C)]
#[derive(Clone)]
pub struct ImageRgb {
    pub raw: Vec<u8>,
    pub w: usize,
    pub h: usize,
    pub fmt: ImageFormat,
    pub align: usize,
}

impl ImageRgb {
    pub fn new(fmt: ImageFormat, align: usize) -> Self {
        Self {
            raw: Vec::new(),
            w: 0,
            h: 0,
            fmt,
            align,
        }
    }

    #[inline]
    pub fn fmt(&self) -> ImageFormat {
        self.fmt
    }

    #[inline]
    pub fn align(&self) -> usize {
        self.align
    }

    #[inline]
    pub fn set_align(&mut self, align: usize) {
        self.align = align;
    }
}

pub struct ImageTexture {
    pub texture: *mut c_void,
    pub w: usize,
    pub h: usize,
}

impl Default for ImageTexture {
    fn default() -> Self {
        Self {
            texture: std::ptr::null_mut(),
            w: 0,
            h: 0,
        }
    }
}

#[inline]
pub fn would_block_if_equal(old: &mut Vec<u8>, b: &[u8]) -> std::io::Result<()> {
    // does this really help?
    if b == &old[..] {
        return Err(std::io::ErrorKind::WouldBlock.into());
    }
    old.resize(b.len(), 0);
    old.copy_from_slice(b);
    Ok(())
}

pub trait TraitCapturer {
    // We doesn't support
    #[cfg(not(any(target_os = "ios")))]
    fn frame<'a>(&'a mut self, timeout: std::time::Duration) -> std::io::Result<Frame<'a>>;

    #[cfg(windows)]
    fn is_gdi(&self) -> bool;
    #[cfg(windows)]
    fn set_gdi(&mut self) -> bool;

    #[cfg(feature = "vram")]
    fn device(&self) -> AdapterDevice;

    #[cfg(feature = "vram")]
    fn set_output_texture(&mut self, texture: bool);
}

#[derive(Debug, Clone, Copy)]
pub struct AdapterDevice {
    pub device: *mut c_void,
    pub vendor_id: ::std::os::raw::c_uint,
    pub luid: i64,
}

impl Default for AdapterDevice {
    fn default() -> Self {
        Self {
            device: std::ptr::null_mut(),
            vendor_id: Default::default(),
            luid: Default::default(),
        }
    }
}

pub trait TraitPixelBuffer {
    fn data(&self) -> &[u8];

    fn width(&self) -> usize;

    fn height(&self) -> usize;

    fn stride(&self) -> Vec<usize>;

    fn pixfmt(&self) -> Pixfmt;
}

#[cfg(not(any(target_os = "ios")))]
pub enum Frame<'a> {
    PixelBuffer(PixelBuffer<'a>),
    Texture((*mut c_void, usize)),
}

#[cfg(not(any(target_os = "ios")))]
impl Frame<'_> {
    pub fn valid<'a>(&'a self) -> bool {
        match self {
            Frame::PixelBuffer(pixelbuffer) => !pixelbuffer.data().is_empty(),
            Frame::Texture((texture, _)) => !texture.is_null(),
        }
    }

    pub fn to<'a>(
        &'a self,
        yuvfmt: EncodeYuvFormat,
        yuv: &'a mut Vec<u8>,
        mid_data: &mut Vec<u8>,
    ) -> ResultType<EncodeInput<'a>> {
        match self {
            Frame::PixelBuffer(pixelbuffer) => {
                convert_to_yuv(&pixelbuffer, yuvfmt, yuv, mid_data)?;
                Ok(EncodeInput::YUV(yuv))
            }
            Frame::Texture(texture) => Ok(EncodeInput::Texture(*texture)),
        }
    }
}

pub enum EncodeInput<'a> {
    YUV(&'a [u8]),
    Texture((*mut c_void, usize)),
    #[cfg(all(windows, feature = "vram"))]
    Repeat,
}

impl<'a> EncodeInput<'a> {
    pub fn yuv(&self) -> ResultType<&'_ [u8]> {
        match self {
            Self::YUV(f) => Ok(f),
            _ => bail!("not pixelfbuffer frame"),
        }
    }

    pub fn texture(&self) -> ResultType<(*mut c_void, usize)> {
        match self {
            Self::Texture(f) => Ok(*f),
            _ => bail!("not texture frame"),
        }
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Pixfmt {
    BGRA,
    RGBA,
    RGB565LE,
    I420,
    NV12,
    I444,
}

impl Pixfmt {
    pub fn bpp(&self) -> usize {
        match self {
            Pixfmt::BGRA | Pixfmt::RGBA => 32,
            Pixfmt::RGB565LE => 16,
            Pixfmt::I420 | Pixfmt::NV12 => 12,
            Pixfmt::I444 => 24,
        }
    }

    pub fn bytes_per_pixel(&self) -> usize {
        (self.bpp() + 7) / 8
    }
}

#[derive(Debug, Clone)]
pub struct EncodeYuvFormat {
    pub pixfmt: Pixfmt,
    pub w: usize,
    pub h: usize,
    pub stride: Vec<usize>,
    pub u: usize,
    pub v: usize,
}

#[cfg(x11)]
#[inline]
pub fn is_x11() -> bool {
    base::platform::linux::is_x11_or_headless()
}

#[cfg(x11)]
#[inline]
pub fn is_cursor_embedded() -> bool {
    if is_x11() {
        x11::IS_CURSOR_EMBEDDED
    } else {
        false
    }
}

#[cfg(not(x11))]
#[inline]
pub fn is_cursor_embedded() -> bool {
    false
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodecName {
    VP8,
    VP9,
    AV1,
    H264RAM(String),
    H265RAM(String),
    H264VRAM,
    H265VRAM,
}

#[derive(PartialEq, Debug, Clone, Copy)]
pub enum CodecFormat {
    VP8,
    VP9,
    AV1,
    H264,
    H265,
    Unknown,
}

impl From<&VideoFrame> for CodecFormat {
    fn from(it: &VideoFrame) -> Self {
        match it.union {
            Some(video_frame::Union::Vp8s(_)) => CodecFormat::VP8,
            Some(video_frame::Union::Vp9s(_)) => CodecFormat::VP9,
            Some(video_frame::Union::Av1s(_)) => CodecFormat::AV1,
            Some(video_frame::Union::H264s(_)) => CodecFormat::H264,
            Some(video_frame::Union::H265s(_)) => CodecFormat::H265,
            _ => CodecFormat::Unknown,
        }
    }
}

impl From<&video_frame::Union> for CodecFormat {
    fn from(it: &video_frame::Union) -> Self {
        match it {
            video_frame::Union::Vp8s(_) => CodecFormat::VP8,
            video_frame::Union::Vp9s(_) => CodecFormat::VP9,
            video_frame::Union::Av1s(_) => CodecFormat::AV1,
            video_frame::Union::H264s(_) => CodecFormat::H264,
            video_frame::Union::H265s(_) => CodecFormat::H265,
            _ => CodecFormat::Unknown,
        }
    }
}

impl From<&CodecName> for CodecFormat {
    fn from(value: &CodecName) -> Self {
        match value {
            CodecName::VP8 => Self::VP8,
            CodecName::VP9 => Self::VP9,
            CodecName::AV1 => Self::AV1,
            CodecName::H264RAM(_) | CodecName::H264VRAM => Self::H264,
            CodecName::H265RAM(_) | CodecName::H265VRAM => Self::H265,
        }
    }
}

impl ToString for CodecFormat {
    fn to_string(&self) -> String {
        match self {
            CodecFormat::VP8 => "VP8".into(),
            CodecFormat::VP9 => "VP9".into(),
            CodecFormat::AV1 => "AV1".into(),
            CodecFormat::H264 => "H264".into(),
            CodecFormat::H265 => "H265".into(),
            CodecFormat::Unknown => "Unknown".into(),
        }
    }
}

#[derive(Debug)]
pub enum Error {
    FailedCall(String),
    BadPtr(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::result::Result<(), std::fmt::Error> {
        write!(f, "{:?}", self)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

#[macro_export]
macro_rules! generate_call_macro {
    ($func_name:ident, $allow_err:expr) => {
        macro_rules! $func_name {
            ($x:expr) => {{
                let result = unsafe { $x };
                let result_int = unsafe { std::mem::transmute::<_, i32>(result) };
                if result_int != 0 {
                    let message = format!(
                        "errcode={} {}:{}:{}:{}",
                        result_int,
                        module_path!(),
                        file!(),
                        line!(),
                        column!()
                    );
                    if $allow_err {
                        log::warn!("Failed to call {}, {}", stringify!($func_name), message);
                    } else {
                        return Err(crate::Error::FailedCall(message).into());
                    }
                }
                result
            }};
        }
    };
}

#[macro_export]
macro_rules! generate_call_ptr_macro {
    ($func_name:ident) => {
        macro_rules! $func_name {
            ($x:expr) => {{
                let result = unsafe { $x };
                let result_int = unsafe { std::mem::transmute::<_, isize>(result) };
                if result_int == 0 {
                    return Err(crate::Error::BadPtr(format!(
                        "errcode={} {}:{}:{}:{}",
                        result_int,
                        module_path!(),
                        file!(),
                        line!(),
                        column!()
                    ))
                    .into());
                }
                result
            }};
        }
    };
}

pub trait GoogleImage {
    fn width(&self) -> usize;
    fn height(&self) -> usize;
    fn stride(&self) -> Vec<i32>;
    fn planes(&self) -> Vec<*mut u8>;
    fn chroma(&self) -> Chroma;
    fn checked_bytes_per_row(w: usize, fmt: ImageFormat, align: usize) -> Option<usize> {
        let bytes_per_pixel = match fmt {
            ImageFormat::Raw => 3usize,
            ImageFormat::ARGB | ImageFormat::ABGR => 4usize,
        };
        let align = align.max(1);
        let raw = w.checked_mul(bytes_per_pixel)?;
        let padded = raw.checked_add(align - 1)?;
        Some(if align.is_power_of_two() {
            padded & !(align - 1)
        } else {
            (padded / align).checked_mul(align)?
        })
    }
    fn get_bytes_per_row(w: usize, fmt: ImageFormat, align: usize) -> usize {
        Self::checked_bytes_per_row(w, fmt, align).unwrap_or(0)
    }
    // rgb [in/out] fmt and stride must be set in ImageRgb
    fn to(&self, rgb: &mut ImageRgb) {
        const MAX_FRAME_DIM: usize = 16384;
        let w = self.width();
        let h = self.height();
        let stride = self.stride();
        let planes = self.planes();
        if w == 0
            || h == 0
            || w > MAX_FRAME_DIM
            || h > MAX_FRAME_DIM
            || planes.len() < 3
            || planes[..3].iter().any(|p| p.is_null())
            || stride.len() < 3
            || stride[..3].iter().any(|&s| s <= 0)
        {
            log::error!("Invalid decoded frame dimensions/planes: {}x{}", w, h);
            rgb.w = 0;
            rgb.h = 0;
            rgb.raw.clear();
            return;
        }
        let Some(bytes_per_row) = Self::checked_bytes_per_row(w, rgb.fmt, rgb.align()) else {
            log::error!("Frame bytes_per_row overflow: {}x{}", w, h);
            rgb.w = 0;
            rgb.h = 0;
            rgb.raw.clear();
            return;
        };
        let Some(total) = h.checked_mul(bytes_per_row) else {
            log::error!("Frame buffer size overflow: {}x{}", w, h);
            rgb.w = 0;
            rgb.h = 0;
            rgb.raw.clear();
            return;
        };
        if std::os::raw::c_int::try_from(bytes_per_row).is_err()
            || std::os::raw::c_int::try_from(w).is_err()
            || std::os::raw::c_int::try_from(h).is_err()
        {
            log::error!("Frame dimensions exceed c_int: {}x{}", w, h);
            rgb.w = 0;
            rgb.h = 0;
            rgb.raw.clear();
            return;
        }
        rgb.w = w;
        rgb.h = h;
        rgb.raw.resize(total, 0);
        unsafe {
            match (self.chroma(), rgb.fmt()) {
                (Chroma::I420, ImageFormat::Raw) => {
                    super::I420ToRAW(
                        planes[0],
                        stride[0],
                        planes[1],
                        stride[1],
                        planes[2],
                        stride[2],
                        rgb.raw.as_mut_ptr(),
                        bytes_per_row as _,
                        self.width() as _,
                        self.height() as _,
                    );
                }
                (Chroma::I420, ImageFormat::ARGB) => {
                    super::I420ToARGB(
                        planes[0],
                        stride[0],
                        planes[1],
                        stride[1],
                        planes[2],
                        stride[2],
                        rgb.raw.as_mut_ptr(),
                        bytes_per_row as _,
                        self.width() as _,
                        self.height() as _,
                    );
                }
                (Chroma::I420, ImageFormat::ABGR) => {
                    super::I420ToABGR(
                        planes[0],
                        stride[0],
                        planes[1],
                        stride[1],
                        planes[2],
                        stride[2],
                        rgb.raw.as_mut_ptr(),
                        bytes_per_row as _,
                        self.width() as _,
                        self.height() as _,
                    );
                }
                (Chroma::I444, ImageFormat::ARGB) => {
                    super::I444ToARGB(
                        planes[0],
                        stride[0],
                        planes[1],
                        stride[1],
                        planes[2],
                        stride[2],
                        rgb.raw.as_mut_ptr(),
                        bytes_per_row as _,
                        self.width() as _,
                        self.height() as _,
                    );
                }
                (Chroma::I444, ImageFormat::ABGR) => {
                    super::I444ToABGR(
                        planes[0],
                        stride[0],
                        planes[1],
                        stride[1],
                        planes[2],
                        stride[2],
                        rgb.raw.as_mut_ptr(),
                        bytes_per_row as _,
                        self.width() as _,
                        self.height() as _,
                    );
                }
                // (Chroma::I444, ImageFormat::Raw), new version libyuv have I444ToRAW
                _ => log::error!("unsupported pixfmt: {:?}", self.chroma()),
            }
        }
    }
    fn data(&self) -> (&[u8], &[u8], &[u8]) {
        const MAX_FRAME_DIM: usize = 16384;
        let w = self.width();
        let h_raw = self.height();
        let stride = self.stride();
        let planes = self.planes();
        if w == 0
            || h_raw == 0
            || w > MAX_FRAME_DIM
            || h_raw > MAX_FRAME_DIM
            || planes.len() < 3
            || planes[..3].iter().any(|p| p.is_null())
            || stride.len() < 3
            || stride[..3].iter().any(|&s| s <= 0)
        {
            return (&[], &[], &[]);
        }
        let Some(h) = h_raw.checked_add(1).map(|v| v & !1) else {
            return (&[], &[], &[]);
        };
        let uv_h = match self.chroma() {
            Chroma::I444 => h,
            _ => h >> 1,
        };
        let (Some(ny), Some(nu), Some(nv)) = (
            (stride[0] as usize).checked_mul(h),
            (stride[1] as usize).checked_mul(uv_h),
            (stride[2] as usize).checked_mul(uv_h),
        ) else {
            return (&[], &[], &[]);
        };
        unsafe {
            let y = slice::from_raw_parts(planes[0], ny);
            let u = slice::from_raw_parts(planes[1], nu);
            let v = slice::from_raw_parts(planes[2], nv);
            (y, u, v)
        }
    }
}

#[cfg(target_os = "android")]
pub fn screen_size() -> (u16, u16, u16) {
    SCREEN_SIZE.lock().unwrap().clone()
}

#[cfg(target_os = "android")]
pub fn is_start() -> Option<bool> {
    android::is_start()
}
