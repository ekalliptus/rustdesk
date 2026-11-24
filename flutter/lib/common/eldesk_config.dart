import 'package:flutter_hbb/consts.dart';
import 'package:flutter_hbb/models/platform_model.dart';

const String kElDeskAppName = String.fromEnvironment(
  'ELDESK_APP_NAME',
  defaultValue: 'EL-Desk',
);
const String kElDeskWebUrl = String.fromEnvironment(
  'ELDESK_WEB_URL',
  defaultValue: 'https://desk.ekalliptus.com',
);
const String kElDeskWebHost = String.fromEnvironment(
  'ELDESK_WEB_HOST',
  defaultValue: 'desk.ekalliptus.com',
);
const String kElDeskDownloadUrl = String.fromEnvironment(
  'ELDESK_DOWNLOAD_URL',
  defaultValue: 'https://desk.ekalliptus.com/#downloads',
);
const String kElDeskPrivacyUrl = String.fromEnvironment(
  'ELDESK_PRIVACY_URL',
  defaultValue: 'https://desk.ekalliptus.com/privacy',
);
const bool kElDeskHideServerSettings = bool.fromEnvironment(
  'ELDESK_HIDE_SERVER_SETTINGS',
  defaultValue: false,
);
const bool kElDeskHideNetworkSettings = bool.fromEnvironment(
  'ELDESK_HIDE_NETWORK_SETTINGS',
  defaultValue: false,
);

bool elDeskHideServerSettings() =>
    kElDeskHideServerSettings ||
    bind.mainGetBuildinOption(key: kOptionHideServerSetting) == 'Y';

bool elDeskHideNetworkSettings() =>
    kElDeskHideNetworkSettings ||
    bind.mainGetBuildinOption(key: kOptionHideNetworkSetting) == 'Y';

String elDeskResolveUpdateUrl(String updateUrl) {
  final trimmed = updateUrl.trim();
  if (trimmed.isEmpty) {
    return kElDeskDownloadUrl;
  }
  final uri = Uri.tryParse(trimmed);
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort ||
      uri.pathSegments.contains('..')) {
    return kElDeskDownloadUrl;
  }
  final host = uri.host.toLowerCase();
  final webHost = kElDeskWebHost.toLowerCase();
  if (host == webHost || host == 'dl.$webHost') {
    return uri.toString();
  }
  return kElDeskDownloadUrl;
}
