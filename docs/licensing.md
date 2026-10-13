# Licensing and redistribution

Squidware uses the **MIT License** in the repository-root [LICENSE](../LICENSE). The copyright attribution is **2026 Squidware contributors**, matching the package's contributor attribution. Individual contributors retain their copyright.

## Decision

On October 12, 2026, the maintainer selected the most permissive reuse direction from MIT, Apache-2.0, and GPL-3.0. MIT supports sharing, commercial reuse, modification, and redistribution with a short requirement to retain copyright and license notices. All three choices are open-source licenses; this decision prioritizes few restrictions on reuse.

| Candidate | Distribution implications | Decision |
| --- | --- | --- |
| [MIT](https://opensource.org/license/mit) | Allows reuse and modified distributions with copyright and permission notices preserved. | Selected for broad reuse with simple obligations. |
| [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Allows permissive reuse, includes an explicit patent grant, and requires license/attribution preservation and notices of modifications. | Considered; MIT's shorter terms match the chosen goal. |
| [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) | Requires covered redistributed works and modifications to provide corresponding source under GPL terms. | Considered; choose this when preserving openness of distributed derivatives is the goal. |

The package metadata identifies the SPDX license as `MIT`. **`private: true` remains** because Squidware is distributed as a desktop application and a source repository, not as an npm library. [npm documents](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private) that this flag prevents publishing to its registry. It does not restrict the rights in LICENSE or prevent Electron packages or GitHub releases.

## Contributions and redistribution

Submit contributions under MIT and preserve existing author and dependency attributions. Identify the source and license of any third-party code, icons, fonts, media, or other assets introduced by a change. Contributors must have the rights needed to supply their contribution under those terms.

Redistribute Squidware source or substantial portions with LICENSE. Keep THIRD_PARTY_NOTICES.txt with bundled application code and preserve any applicable third-party notices when changing dependencies or packaging. Desktop distributions include these readable files outside `app.asar`:

| File within `resources/legal/` (or `Contents/Resources/legal/` on macOS) | Contents |
| --- | --- |
| `LICENSE.txt` | Squidware's complete MIT license and copyright notice. |
| `THIRD_PARTY_NOTICES.txt` | Full installed runtime package licenses: React, React DOM, Scheduler, Three.js, Lucide/Feather, and Electron. |
| `LICENSES.chromium.html` | The full notice file supplied with the installed Electron runtime, including Chromium and its bundled components. |

The Windows portable executable and Linux AppImage contain these files in the embedded application; the macOS DMG contains them inside Squidware.app. Windows portable mode extracts the resources into its temporary application directory at launch. Preserve the complete embedded package when redistributing. Electron-builder normally removes Electron's top-level notices when creating a macOS app; the explicit `extraResources` configuration preserves Chromium's notice file across targets.

This inventory covers the dependencies shipped by the current application and the complete notice file provided by Electron. Build/test tools are acquired with their upstream licenses and are not bundled into the application. This is a reproducible distribution check, not an exhaustive legal audit of every upstream component or future asset.

## Updating dependencies

Install the locked dependencies, and install the Electron runtime before packaging:

```sh
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm licenses:generate
pnpm licenses:check
```

The generator follows installed production dependencies and their transitive dependencies, adds Electron's license because its binary ships despite being a development dependency, and preserves each package's root license/notice files verbatim except line-ending normalization. Lucide's notice references inherited Feather icons; [Feather's upstream MIT text](https://github.com/feathericons/feather/blob/v4.29.2/LICENSE) is also preserved in `licenses/Feather-LICENSE.txt` and the generated inventory.

Review and commit the resulting THIRD_PARTY_NOTICES.txt when changing locked dependencies. Generation does not decide whether a new license is appropriate. Review new license terms and any nested asset notices before bundling a new component. If imported assets or package files add a separate license requirement, extend the notice collection for that material. Missing root notice files cause generation to fail rather than silently omitting attribution.

The regular build checks that the committed inventory matches the installed runtime packages. Electron-builder checks the inventory again before packaging and compares all three packaged legal files byte-for-byte with their sources after packaging, so a missing or altered resource fails the build. Chromium's large HTML notice file is copied from the installed runtime at packaging time; the source repository does not vendor the Electron binary or Chromium code.

## Verification

Run `pnpm licenses:check` and build a native package with `pnpm dist --publish never`. Inspect the unpacked application's legal directory and the embedded resources in one distributable. The packaging hook checks the unpacked application automatically; inspection of the distributable verifies that its archive retains the same directory.

The root LICENSE uses the unchanged [GitHub MIT template](https://choosealicense.com/licenses/mit/) with the copyright placeholders filled in. [GitHub uses Licensee](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository#detecting-a-license) for repository license detection. Verify that GitHub identifies `MIT` after this change reaches the default branch; a local template match does not by itself confirm GitHub's live repository metadata.
