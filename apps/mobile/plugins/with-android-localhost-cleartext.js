// Config plugin Expo — autorise le HTTP cleartext UNIQUEMENT vers l'hôte de dev local
// (localhost / 127.0.0.1 / 10.0.2.2) sur Android, via un `network_security_config.xml`.
//
// Pourquoi : en build **release**, Android refuse le cleartext par défaut → l'app ne peut
// pas joindre l'API/auth locale en `http://localhost:3010/3011` (login « Connexion
// impossible »). C'est ce qui forçait à valider Android en debug+Metro (fragile). Ce
// plugin donne au release standalone (`pnpm sim`) la MÊME capacité que `NSAllowsLocalNetworking`
// côté iOS → la validation device Android devient aussi fiable que iOS.
//
// Sûr en prod : le `base-config` REFUSE le cleartext partout ; seul le `domain-config`
// localhost l'autorise. La prod parle à `api.ridenrest.app` en HTTPS (jamais localhost).
// `networkSecurityConfig` supersède `usesCleartextTraffic` sur API ≥ 24 (minSdk = 24).

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const NSC_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par plugins/with-android-localhost-cleartext.js — ne pas éditer à la main. -->
<network-security-config>
    <!-- Prod : HTTPS only. Cleartext refusé par défaut. -->
    <base-config cleartextTrafficPermitted="false" />
    <!-- Dev local uniquement : backend NestJS/auth en http://localhost:3010/3011
         (10.0.2.2 = hôte vu depuis l'émulateur Android). -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
`;

/** @param {import('@expo/config-plugins').ExportedConfig} config */
const withAndroidLocalhostCleartext = (config) => {
  // 1) Écrit res/xml/network_security_config.xml au prebuild.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        NSC_XML,
      );
      return cfg;
    },
  ]);

  // 2) Référence le fichier sur <application>.
  config = withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] =
        '@xml/network_security_config';
    }
    return cfg;
  });

  return config;
};

module.exports = withAndroidLocalhostCleartext;
