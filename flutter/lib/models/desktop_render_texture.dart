import 'package:flutter/material.dart';
import 'package:flutter_gpu_texture_renderer/flutter_gpu_texture_renderer.dart';
import 'package:flutter_hbb/common/shared_state.dart';
import 'package:flutter_hbb/consts.dart';
import 'package:flutter_hbb/models/model.dart';
import 'package:get/get.dart';

import '../../common.dart';
import './platform_model.dart';

import 'package:texture_rgba_renderer/texture_rgba_renderer.dart'
    if (dart.library.html) 'package:flutter_hbb/web/texture_rgba_renderer.dart';

class _PixelbufferTexture {
  int _textureKey = -1;
  int _display = 0;
  SessionID? _sessionId;
  bool _destroying = false;
  bool _disposed = false;
  bool _created = false;
  int? _id;

  final textureRenderer = TextureRgbaRenderer();

  int get display => _display;

  create(int d, SessionID sessionId, FFI ffi) {
    _display = d;
    _textureKey = bind.getNextTextureKey();
    _sessionId = sessionId;
    _disposed = false;
    _created = false;
    final key = _textureKey;

    textureRenderer.createTexture(key).then((id) async {
      if (_disposed) {
        if (id != -1) {
          await textureRenderer.closeTexture(key);
        }
        return;
      }
      _id = id;
      if (id != -1) {
        final ptr = await textureRenderer.getTexturePtr(key);
        if (_disposed) {
          await textureRenderer.closeTexture(key);
          return;
        }
        _created = true;
        ffi.textureModel.setRgbaTextureId(display: d, id: id);
        platformFFI.registerPixelbufferTexture(sessionId, display, ptr);
        debugPrint(
            "create pixelbuffer texture: peerId: ${ffi.id} display:$_display, textureId:$id, texturePtr:$ptr");
      }
    });
  }

  destroy(bool unregisterTexture, FFI ffi) async {
    if (_disposed || _destroying) {
      return;
    }
    _disposed = true;
    final key = _textureKey;
    final sessionId = _sessionId;
    if (_created && key != -1 && sessionId != null) {
      _destroying = true;
      platformFFI.registerPixelbufferTexture(sessionId, display, 0);
      // sleep for a while to avoid the texture is used after it's unregistered.
      await Future.delayed(Duration(milliseconds: 100));
      await textureRenderer.closeTexture(key);
      _textureKey = -1;
      _created = false;
      _destroying = false;
      debugPrint(
          "destroy pixelbuffer texture: peerId: ${ffi.id} display:$_display, textureId:$_id");
    }
  }
}

class _GpuTexture {
  int _textureId = -1;
  SessionID? _sessionId;
  final support = bind.mainHasGpuTextureRender();
  bool _destroying = false;
  bool _disposed = false;
  bool _created = false;
  int _display = 0;
  int? _id;
  int? _output;

  int get display => _display;

  final gpuTextureRenderer = FlutterGpuTextureRenderer();

  _GpuTexture();

  create(int d, SessionID sessionId, FFI ffi) {
    if (support) {
      _sessionId = sessionId;
      _display = d;
      _disposed = false;
      _created = false;

      gpuTextureRenderer.registerTexture().then((id) async {
        if (_disposed) {
          if (id != null) {
            await gpuTextureRenderer.unregisterTexture(id);
          }
          return;
        }
        _id = id;
        if (id != null) {
          final output = await gpuTextureRenderer.output(id);
          if (_disposed) {
            await gpuTextureRenderer.unregisterTexture(id);
            return;
          }
          _textureId = id;
          _output = output;
          _created = true;
          ffi.textureModel.setGpuTextureId(display: d, id: id);
          if (output != null) {
            platformFFI.registerGpuTexture(sessionId, d, output);
          }
          debugPrint(
              "create gpu texture: peerId: ${ffi.id} display:$_display, textureId:$id, output:$output");
        }
      }, onError: (err) {
        debugPrint("Failed to register gpu texture:$err");
      });
    }
  }

  destroy(bool unregisterTexture, FFI ffi) async {
    // must stop texture render, render unregistered texture cause crash
    if (_disposed || _destroying) {
      return;
    }
    _disposed = true;
    final textureId = _textureId;
    final sessionId = _sessionId;
    if (_created && support && sessionId != null && textureId != -1) {
      _destroying = true;
      platformFFI.registerGpuTexture(sessionId, _display, 0);
      // sleep for a while to avoid the texture is used after it's unregistered.
      await Future.delayed(Duration(milliseconds: 100));
      await gpuTextureRenderer.unregisterTexture(textureId);
      _textureId = -1;
      _created = false;
      _destroying = false;
      debugPrint(
          "destroy gpu texture: peerId: ${ffi.id} display:$_display, textureId:$_id, output:$_output");
    }
  }
}

class _Control {
  RxInt textureID = (-1).obs;

  int _rgbaTextureId = -1;
  int get rgbaTextureId => _rgbaTextureId;
  int _gpuTextureId = -1;
  int get gpuTextureId => _gpuTextureId;
  bool _isGpuTexture = false;
  bool get isGpuTexture => _isGpuTexture;

  setTextureType({bool gpuTexture = false}) {
    _isGpuTexture = gpuTexture;
    textureID.value = _isGpuTexture ? gpuTextureId : rgbaTextureId;
  }

  setRgbaTextureId(int id) {
    _rgbaTextureId = id;
    textureID.value = _isGpuTexture ? gpuTextureId : rgbaTextureId;
  }

  setGpuTextureId(int id) {
    _gpuTextureId = id;
    textureID.value = _isGpuTexture ? gpuTextureId : rgbaTextureId;
  }
}

class TextureModel {
  final WeakReference<FFI> parent;
  final Map<int, _Control> _control = {};
  final Map<int, _PixelbufferTexture> _pixelbufferRenderTextures = {};
  final Map<int, _GpuTexture> _gpuRenderTextures = {};

  TextureModel(this.parent);

  setTextureType({required int display, required bool gpuTexture}) {
    debugPrint("setTextureType: display=$display, isGpuTexture=$gpuTexture");
    ensureControl(display);
    _control[display]?.setTextureType(gpuTexture: gpuTexture);
    // For versions that do not support multiple displays, the display parameter is always 0, need set type of current display
    final ffi = parent.target;
    if (ffi == null) return;
    if (!ffi.ffiModel.pi.isSupportMultiDisplay) {
      final currentDisplay = CurrentDisplayState.find(ffi.id).value;
      if (currentDisplay != display) {
        debugPrint(
            "setTextureType: currentDisplay=$currentDisplay, isGpuTexture=$gpuTexture");
        ensureControl(currentDisplay);
        _control[currentDisplay]?.setTextureType(gpuTexture: gpuTexture);
      }
    }
  }

  setRgbaTextureId({required int display, required int id}) {
    ensureControl(display);
    _control[display]?.setRgbaTextureId(id);
  }

  setGpuTextureId({required int display, required int id}) {
    ensureControl(display);
    _control[display]?.setGpuTextureId(id);
  }

  RxInt getTextureId(int display) {
    ensureControl(display);
    return _control[display]!.textureID;
  }

  updateCurrentDisplay(int curDisplay) {
    if (isWeb) return;
    final ffi = parent.target;
    if (ffi == null) return;
    tryCreateTexture(int idx) {
      if (!_pixelbufferRenderTextures.containsKey(idx)) {
        final renderTexture = _PixelbufferTexture();
        _pixelbufferRenderTextures[idx] = renderTexture;
        renderTexture.create(idx, ffi.sessionId, ffi);
      }
      if (!_gpuRenderTextures.containsKey(idx)) {
        final renderTexture = _GpuTexture();
        _gpuRenderTextures[idx] = renderTexture;
        renderTexture.create(idx, ffi.sessionId, ffi);
      }
    }

    tryRemoveTexture(int idx) {
      _control.remove(idx);
      if (_pixelbufferRenderTextures.containsKey(idx)) {
        _pixelbufferRenderTextures[idx]!.destroy(true, ffi);
        _pixelbufferRenderTextures.remove(idx);
      }
      if (_gpuRenderTextures.containsKey(idx)) {
        _gpuRenderTextures[idx]!.destroy(true, ffi);
        _gpuRenderTextures.remove(idx);
      }
    }

    final existingKeys = <int>{
      ..._pixelbufferRenderTextures.keys,
      ..._gpuRenderTextures.keys,
      ..._control.keys,
    };
    if (curDisplay == kAllDisplayValue) {
      final displays = ffi.ffiModel.pi.getCurDisplays();
      for (var i = 0; i < displays.length; i++) {
        tryCreateTexture(i);
      }
      for (final idx in existingKeys) {
        if (idx >= displays.length || idx < 0) {
          tryRemoveTexture(idx);
        }
      }
    } else {
      tryCreateTexture(curDisplay);
      for (final idx in existingKeys) {
        if (idx != curDisplay) {
          tryRemoveTexture(idx);
        }
      }
    }
  }

  Future<void> _disposeAllTextures(bool closeSession, FFI ffi) async {
    final pixelTextures = _pixelbufferRenderTextures.values.toList();
    final gpuTextures = _gpuRenderTextures.values.toList();
    _pixelbufferRenderTextures.clear();
    _gpuRenderTextures.clear();
    _control.clear();
    for (final texture in pixelTextures) {
      await texture.destroy(closeSession, ffi);
    }
    for (final texture in gpuTextures) {
      await texture.destroy(closeSession, ffi);
    }
  }

  onRemotePageDispose(bool closeSession) async {
    final ffi = parent.target;
    if (ffi == null) return;
    await _disposeAllTextures(closeSession, ffi);
  }

  onViewCameraPageDispose(bool closeSession) async {
    final ffi = parent.target;
    if (ffi == null) return;
    await _disposeAllTextures(closeSession, ffi);
  }

  ensureControl(int display) {
    var ctl = _control[display];
    if (ctl == null) {
      ctl = _Control();
      _control[display] = ctl;
    }
  }
}
