# Epix Mesh Chat

Public rooms and encrypted private groups for connected EpixNet peers. Create a local profile without Internet access or an xID. An existing xID can be linked later when its identity information can be verified.

This xite requires EpixNet's native `localProfile` API, introduced in [EpixNet #728](https://github.com/EpixZone/EpixNet/pull/728). The offline transport fixes are in [#726](https://github.com/EpixZone/EpixNet/pull/726) and [#727](https://github.com/EpixZone/EpixNet/pull/727). A normal web server or public gateway cannot provide local profiles. Older EpixNet versions show an upgrade message.

## Using the xite

1. Save the same signed xite on every device before leaving Internet coverage, or transfer a verified copy from a nearby peer.
2. Open the xite in EpixNet Browser and choose a display name.
3. Approve the local-profile permission in EpixNet's trusted wrapper. Private keys stay in EpixNet.
4. Join a public room by name. Anyone who downloads this xite can read its public messages.
5. Connect devices through a working LAN or configured Reticulum bridge. Creating a profile does not create a network connection.
6. Once another person's profile reaches your device, select that profile to create a private group.

A local display name does not prove ownership of an xID. Compare the full profile address when identity matters. Only a currently verified xID link gets a verified label; stale or unavailable chain information does not stop local chat.

Private-group membership is fixed. Create a new group to add or remove people. Members can save or share what they read. The current encryption format does not provide forward secrecy, and public metadata includes the sender, time, ciphertext size and number of encrypted copies.

A message accepted by a peer is not proof that a person received or read it. The app distinguishes peer acceptance from a message saved only on your device.

## Offline operation and history

All application assets are bundled. The xite has no CDN, remote font, analytics or hosted chat-service dependency. Signing, encryption and verified storage are handled by EpixNet.

Keep an EpixNet backup to preserve the master identity and local profile keys. A new installation without that identity creates a different local profile. Merely changing or linking an xID does not change the local profile address.

History is bounded. Each author keeps up to 128 public and 32 private records, further limited by document size. Old messages can be pruned. Keep a separate record of anything you need to retain permanently.

EpixNet's `offline` configuration disables network transports, including mesh and local discovery. For communication without Internet, leave transport operation enabled and configure only the local connections you intend to use. A LoRa radio, Bluetooth adapter or Wi-Fi interface needs a working bridge and network configuration; opening this xite does not supply native radio drivers.

## Development

There is no build step. The application consists of `index.html`, `css/app.css`, `js/frame.js` and `js/app.js`.

Run the dependency-free protocol and presentation tests with:

```sh
npm test
```

The frontend asks for `LOCAL_PROFILE` only after a user chooses to create a profile. It never requests `ADMIN`, accepts a private key, or stores credentials in browser storage. Untrusted names and messages are rendered as text.

Deployment uses a signed root manifest that includes `data/users/content.json`. That governor allows each native local-profile author to sign only their own bounded `data.json`. Runtime user documents and private node data must not be committed to this repository.

## Creating a separate chat xite

Each xite address has its own profiles and conversations. Everyone joining the same chat must use the same address. Creating another clone creates a separate community.

1. Use an EpixNet build that includes the native local-profile API and run `epix-server siteCreate`. Keep the generated owner key and node backup private.
2. Copy only `index.html`, `css/` and `js/` into the newly created xite directory. Do not copy another node's `private/` directory.
3. Copy `deployment/users-content.json.example` to that xite's `data/users/content.json`, replacing the address placeholder with the new xite address.
4. Set the title and description in the root `content.json`, and add this root property with the same address:

```json
"includes": {
  "data/users/content.json": {
    "signers": ["REPLACE_WITH_YOUR_XITE_ADDRESS"],
    "signers_required": 1
  }
}
```

Start EpixNet with the new address and leave that node running. In a second terminal, using the same node data directory, sign the root and its user-content rules:

```sh
epix-server siteSign YOUR_XITE_ADDRESS --full
epix-server siteSign YOUR_XITE_ADDRESS stored data/users/content.json --full
epix-server sitePublish YOUR_XITE_ADDRESS
```

Here `stored` tells the running node to use its saved owner key. It is not a private key and does not work as a key when the node is stopped. The owner-signed rules allow signed data from local profiles without requiring an xID certificate. Keep the rule limited to `data.json` and retain the size limit.

Share the address with connected peers, verify that a second device downloads it, and create a local profile there. Keep at least one reachable copy of the xite and its signed data. A source repository alone does not seed an EpixNet xite.
