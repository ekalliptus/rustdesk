use crate::config::keys;
use anyhow::{bail, Result};
use hbb_common::config;
use serde_derive::Deserialize;

pub const DEFAULT_APP_NAME: &str = "EL-Desk";
pub const DEFAULT_RENDEZVOUS_SERVER: &str = "relay.desk.ekalliptus.com";
pub const DEFAULT_API_SERVER: &str = "https://api.desk.ekalliptus.com";
pub const DEFAULT_WEB_URL: &str = "https://desk.ekalliptus.com";
pub const DEFAULT_UPDATE_URL: &str = "https://dl.desk.ekalliptus.com/latest.json";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedPrivateUpdate {
    pub version: String,
    pub url: String,
}

#[derive(Deserialize)]
struct RawPrivateUpdateManifest {
    version: String,
    #[allow(dead_code)]
    #[serde(default)]
    release_id: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[inline]
fn env_or(val: Option<&'static str>, default: &'static str) -> &'static str {
    match val {
        Some(v) => {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                default
            } else {
                trimmed
            }
        }
        None => default,
    }
}

#[inline]
fn parse_bool_env(val: Option<&'static str>, default: bool) -> bool {
    match val.map(str::trim) {
        Some(v) if v.is_empty() => default,
        Some(v)
            if v.eq_ignore_ascii_case("0")
                || v.eq_ignore_ascii_case("false")
                || v.eq_ignore_ascii_case("n")
                || v.eq_ignore_ascii_case("no") =>
        {
            false
        }
        Some(v)
            if v.eq_ignore_ascii_case("1")
                || v.eq_ignore_ascii_case("true")
                || v.eq_ignore_ascii_case("y")
                || v.eq_ignore_ascii_case("yes") =>
        {
            true
        }
        _ => default,
    }
}

#[inline]
pub fn app_name() -> &'static str {
    env_or(option_env!("CUSTOM_APP_NAME"), DEFAULT_APP_NAME)
}

#[inline]
pub fn rendezvous_server() -> &'static str {
    env_or(
        option_env!("CUSTOM_RENDEZVOUS_SERVER"),
        DEFAULT_RENDEZVOUS_SERVER,
    )
}

#[inline]
pub fn relay_server() -> &'static str {
    env_or(option_env!("CUSTOM_RELAY_SERVER"), rendezvous_server())
}

#[inline]
pub fn api_server() -> &'static str {
    env_or(option_env!("CUSTOM_API_SERVER"), DEFAULT_API_SERVER)
}

#[inline]
pub fn rs_pub_key() -> &'static str {
    match option_env!("CUSTOM_RS_PUB_KEY") {
        Some(v) => v.trim(),
        None => "",
    }
}

#[inline]
pub fn web_url() -> &'static str {
    env_or(option_env!("CUSTOM_WEB_URL"), DEFAULT_WEB_URL)
}

#[inline]
pub fn update_url() -> &'static str {
    env_or(option_env!("CUSTOM_UPDATE_URL"), DEFAULT_UPDATE_URL)
}

#[inline]
pub fn hide_server_settings() -> bool {
    parse_bool_env(option_env!("CUSTOM_HIDE_SERVER_SETTINGS"), true)
}

#[inline]
pub fn hide_network_settings() -> bool {
    parse_bool_env(option_env!("CUSTOM_HIDE_NETWORK_SETTINGS"), false)
}

#[inline]
pub fn enforce_encrypted_only() -> bool {
    parse_bool_env(option_env!("CUSTOM_ENCRYPTED_ONLY"), true)
}

fn apply_private_defaults_with(
    app_name: &str,
    rendezvous: &str,
    relay: &str,
    api: &str,
    pub_key: &str,
    hide_server: bool,
    hide_network: bool,
    encrypted_only: bool,
) {
    *config::APP_NAME.write().unwrap() = app_name.to_owned();
    *config::PROD_RENDEZVOUS_SERVER.write().unwrap() = rendezvous.to_owned();

    {
        let mut builtin = config::BUILTIN_SETTINGS.write().unwrap();
        if hide_server {
            builtin.insert(keys::OPTION_HIDE_SERVER_SETTINGS.to_owned(), "Y".to_owned());
        }
        if hide_network {
            builtin.insert(keys::OPTION_HIDE_NETWORK_SETTINGS.to_owned(), "Y".to_owned());
        }
    }

    {
        let mut defaults = config::DEFAULT_SETTINGS.write().unwrap();
        defaults.insert("custom-rendezvous-server".to_owned(), rendezvous.to_owned());
        defaults.insert(keys::OPTION_RELAY_SERVER.to_owned(), relay.to_owned());
        defaults.insert("api-server".to_owned(), api.to_owned());
        defaults.insert(keys::OPTION_DIRECT_SERVER.to_owned(), "N".to_owned());
        if !pub_key.is_empty() {
            defaults.insert("key".to_owned(), pub_key.to_owned());
        }
    }

    {
        let mut overwrite = config::OVERWRITE_SETTINGS.write().unwrap();
        if encrypted_only {
            overwrite.insert(
                keys::OPTION_ALLOW_INSECURE_TLS_FALLBACK.to_owned(),
                "N".to_owned(),
            );
        }
        if hide_server {
            overwrite.insert("custom-rendezvous-server".to_owned(), rendezvous.to_owned());
            overwrite.insert(keys::OPTION_RELAY_SERVER.to_owned(), relay.to_owned());
            overwrite.insert("api-server".to_owned(), api.to_owned());
            if !pub_key.is_empty() {
                overwrite.insert("key".to_owned(), pub_key.to_owned());
            }
        }
    }
}

pub fn apply_private_defaults() {
    apply_private_defaults_with(
        app_name(),
        rendezvous_server(),
        relay_server(),
        api_server(),
        rs_pub_key(),
        hide_server_settings(),
        hide_network_settings(),
        enforce_encrypted_only(),
    );
}

fn validate_semver_3part(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    let version = trimmed.strip_prefix('v').unwrap_or(trimmed);
    let segments: Vec<&str> = version.split('.').collect();
    if segments.len() != 3
        || segments.iter().any(|s| {
            s.is_empty() || !s.chars().all(|c| c.is_ascii_digit()) || s.parse::<u16>().is_err()
        })
    {
        bail!("Invalid release version in private update manifest: {}", raw);
    }
    if hbb_common::get_version_number(version) <= 0 {
        bail!("Invalid numeric release version: {}", raw);
    }
    Ok(version.to_owned())
}

fn extract_https_host(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let rest = trimmed.strip_prefix("https://")?;
    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.is_empty()
        || authority.contains('@')
        || authority.contains(':')
        || authority.contains('\\')
        || authority.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }
    let host = authority.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

fn has_unsafe_url_parts(raw: &str) -> bool {
    if raw.contains('\\') || raw.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return true;
    }
    let Some(rest) = raw.strip_prefix("https://") else {
        return true;
    };
    let path_only = rest.split(['?', '#']).next().unwrap_or("");
    let mut parts = path_only.split('/');
    let _authority = parts.next();
    parts.any(|seg| seg == ".." || seg.eq_ignore_ascii_case("%2e%2e"))
}

pub fn parse_private_update_manifest(
    bytes: &[u8],
    update_endpoint: &str,
    fallback_web_url: &str,
) -> Result<ParsedPrivateUpdate> {
    let raw: RawPrivateUpdateManifest = serde_json::from_slice(bytes)?;
    let version = validate_semver_3part(&raw.version)?;

    let mut allowed_hosts = Vec::new();
    for src in [update_endpoint, fallback_web_url] {
        if let Some(host) = extract_https_host(src) {
            if !allowed_hosts.contains(&host) {
                allowed_hosts.push(host);
            }
        }
    }
    if allowed_hosts.is_empty() {
        bail!("No trusted HTTPS update host configured");
    }

    let candidate = raw
        .url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback_web_url.trim());
    if has_unsafe_url_parts(candidate) {
        bail!("Untrusted or malformed update URL: {}", candidate);
    }
    let Some(host) = extract_https_host(candidate) else {
        bail!("Update URL must use HTTPS without credentials or port: {}", candidate);
    };
    if !allowed_hosts.contains(&host) {
        bail!("Update URL host {} is not in allowed private hosts", host);
    }

    Ok(ParsedPrivateUpdate {
        version,
        url: candidate.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_defaults_never_fallback_to_public_rustdesk() {
        assert_eq!(app_name(), "EL-Desk");
        assert_eq!(rendezvous_server(), "relay.desk.ekalliptus.com");
        assert_eq!(relay_server(), "relay.desk.ekalliptus.com");
        assert_eq!(api_server(), "https://api.desk.ekalliptus.com");
        assert_eq!(web_url(), "https://desk.ekalliptus.com");
        assert_eq!(update_url(), "https://dl.desk.ekalliptus.com/latest.json");
        assert_ne!(
            rs_pub_key(),
            "OeVuKk5nlHiXp+APNn0Y3pC1Iwpwn44JGqrQCsWqmBw="
        );
        assert!(hide_server_settings());
        assert!(!hide_network_settings());
        assert!(enforce_encrypted_only());
    }

    #[test]
    fn parse_bool_env_handles_defaults_and_overrides() {
        assert!(parse_bool_env(None, true));
        assert!(!parse_bool_env(None, false));
        assert!(parse_bool_env(Some("   "), true));
        assert!(!parse_bool_env(Some("false"), true));
        assert!(!parse_bool_env(Some("0"), true));
        assert!(!parse_bool_env(Some("N"), true));
        assert!(parse_bool_env(Some("yes"), false));
        assert!(parse_bool_env(Some("1"), false));
        assert!(parse_bool_env(Some("invalid"), true));
    }

    #[test]
    fn apply_private_defaults_populates_locked_runtime_config() {
        let prev_app = config::APP_NAME.read().unwrap().clone();
        let prev_prod = config::PROD_RENDEZVOUS_SERVER.read().unwrap().clone();
        let prev_builtin = config::BUILTIN_SETTINGS.read().unwrap().clone();
        let prev_default = config::DEFAULT_SETTINGS.read().unwrap().clone();
        let prev_overwrite = config::OVERWRITE_SETTINGS.read().unwrap().clone();

        apply_private_defaults_with(
            "EL-Desk",
            "relay.desk.ekalliptus.com",
            "relay.desk.ekalliptus.com",
            "https://api.desk.ekalliptus.com",
            "test-pub-key-123",
            true,
            false,
            true,
        );

        assert_eq!(*config::APP_NAME.read().unwrap(), "EL-Desk");
        assert_eq!(
            *config::PROD_RENDEZVOUS_SERVER.read().unwrap(),
            "relay.desk.ekalliptus.com"
        );
        assert_eq!(
            config::Config::get_rendezvous_server(),
            "relay.desk.ekalliptus.com:21116"
        );
        assert_eq!(
            config::BUILTIN_SETTINGS
                .read()
                .unwrap()
                .get(keys::OPTION_HIDE_SERVER_SETTINGS)
                .map(String::as_str),
            Some("Y")
        );
        assert_eq!(
            config::OVERWRITE_SETTINGS
                .read()
                .unwrap()
                .get(keys::OPTION_ALLOW_INSECURE_TLS_FALLBACK)
                .map(String::as_str),
            Some("N")
        );
        assert_eq!(
            config::OVERWRITE_SETTINGS
                .read()
                .unwrap()
                .get("key")
                .map(String::as_str),
            Some("test-pub-key-123")
        );

        *config::APP_NAME.write().unwrap() = prev_app;
        *config::PROD_RENDEZVOUS_SERVER.write().unwrap() = prev_prod;
        *config::BUILTIN_SETTINGS.write().unwrap() = prev_builtin;
        *config::DEFAULT_SETTINGS.write().unwrap() = prev_default;
        *config::OVERWRITE_SETTINGS.write().unwrap() = prev_overwrite;
    }

    #[test]
    fn parse_private_update_manifest_enforces_trusted_hosts_and_https() {
        let valid = br#"{"version":"v1.4.8","release_id":"v1.4.8","url":"https://dl.desk.ekalliptus.com/v1.4.8/EL-Desk-1.4.8.exe"}"#;
        let parsed = parse_private_update_manifest(
            valid,
            "https://dl.desk.ekalliptus.com/latest.json",
            "https://desk.ekalliptus.com",
        )
        .unwrap();
        assert_eq!(parsed.version, "1.4.8");
        assert_eq!(
            parsed.url,
            "https://dl.desk.ekalliptus.com/v1.4.8/EL-Desk-1.4.8.exe"
        );

        let fallback = br#"{"version":"1.5.0"}"#;
        let parsed_fallback = parse_private_update_manifest(
            fallback,
            "https://dl.desk.ekalliptus.com/latest.json",
            "https://desk.ekalliptus.com",
        )
        .unwrap();
        assert_eq!(parsed_fallback.version, "1.5.0");
        assert_eq!(parsed_fallback.url, "https://desk.ekalliptus.com");

        for bad in [
            &br#"{"version":"1.4.8","url":"http://dl.desk.ekalliptus.com/a.exe"}"#[..],
            &br#"{"version":"1.4.8","url":"https://github.com/rustdesk/rustdesk/releases/tag/v1.4.8"}"#[..],
            &br#"{"version":"1.4.8","url":"https://rustdesk.com/download"}"#[..],
            &br#"{"version":"1.4.8","url":"https://user@dl.desk.ekalliptus.com/a.exe"}"#[..],
            &br#"{"version":"1.4.8","url":"https://dl.desk.ekalliptus.com/../evil.exe"}"#[..],
            &br#"{"version":"1.4.8-rc1","url":"https://dl.desk.ekalliptus.com/a.exe"}"#[..],
        ] {
            assert!(parse_private_update_manifest(
                bad,
                "https://dl.desk.ekalliptus.com/latest.json",
                "https://desk.ekalliptus.com",
            )
            .is_err());
        }
    }
}
