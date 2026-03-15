# Firefox 版本打包说明

本文档用于记录本项目 Firefox 版本的打包、校验与 AMO 上架注意事项，方便后续重复使用。

## 适用范围

- 项目目录：`F:\AIProject\Web\AIBook`
- Firefox 专用清单：`manifest.firefox.json`
- 打包脚本：`scripts/package.ps1`
- Firefox 快捷入口：`scripts/package-firefox.cmd`
- 输出目录：`release/`

## 当前 Firefox 固定配置

以下配置已经在 `manifest.firefox.json` 中处理好，后续打包时不要随意删改：

- 使用 Firefox 专用 manifest，而不是直接拿 `manifest.json` 上传。
- `background.scripts` 作为 Firefox fallback 保留。
- `background.service_worker` 仍保留，用于兼容现有 MV3 结构。
- `browser_specific_settings.gecko.id` 固定为 `ai-bookmark-organizer@youlai.com`。
- `browser_specific_settings.gecko.data_collection_permissions` 已声明。
- `strict_min_version` 当前为桌面版 `140.0`。
- `gecko_android.strict_min_version` 当前为 Android `142.0`。

## 打包前检查

每次打包前先确认下面几项：

1. 确认 `manifest.firefox.json` 里的 `version` 已更新到目标版本。
2. 确认 `browser_specific_settings.gecko.id` 仍然是 AMO 上现有条目的 ID：
   `ai-bookmark-organizer@youlai.com`
3. 确认 `manifest.firefox.json` 中保留以下 `background` 配置：

```json
"background": {
  "scripts": ["background.js"],
  "service_worker": "background.js",
  "preferred_environment": ["document", "service_worker"],
  "type": "module"
}
```

4. 确认 `scripts/package.ps1` 仍然使用自定义 ZIP 写入逻辑，而不是 `Compress-Archive`。
   原因：Firefox 商店会拒绝 ZIP 内部使用反斜杠路径的文件名，例如 `config\app.config.js`。

## 打包命令

推荐使用下面任一方式：

### 方式一：直接执行 PowerShell 脚本

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package.ps1 -Target firefox
```

### 方式二：执行批处理入口

```powershell
.\scripts\package-firefox.cmd
```

## 打包产物

成功后会生成两类内容：

- 暂存目录：`release/staging-firefox-<version>/`
- 发布包：`release/AIBook-firefox-<version>.zip`

例如版本 `1.1.3` 的产物：

- `release/staging-firefox-1.1.3/`
- `release/AIBook-firefox-1.1.3.zip`

## 上传前校验

### 1. 校验 ZIP 内部路径分隔符

Firefox 商店要求 ZIP 内部文件名使用 `/`，不能是 Windows 风格的 `\`。

可用下面命令检查：

```powershell
@'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('F:\AIProject\Web\AIBook\release\AIBook-firefox-1.1.3.zip')
$zip.Entries | Select-Object -First 40 FullName
$zip.Dispose()
'@ | powershell -NoProfile -ExecutionPolicy Bypass -
```

正常示例：

- `config/app.config.js`
- `manager/index.html`
- `popup/popup.js`

异常示例：

- `config\app.config.js`

如果看到反斜杠，说明打包脚本被改坏了，先修 `scripts/package.ps1`，不要直接上传。

### 2. 校验 manifest 内的 Firefox ID

可直接从 ZIP 中读取 `manifest.json` 检查：

```powershell
@'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('F:\AIProject\Web\AIBook\release\AIBook-firefox-1.1.3.zip')
$entry = $zip.GetEntry('manifest.json')
$reader = New-Object System.IO.StreamReader($entry.Open())
$content = $reader.ReadToEnd()
$reader.Dispose()
$zip.Dispose()
$content
'@ | powershell -NoProfile -ExecutionPolicy Bypass -
```

重点确认：

- `browser_specific_settings.gecko.id` 必须是 `ai-bookmark-organizer@youlai.com`

如果 ID 不匹配，AMO 会报错：

`您的 manifest.json 中的附加组件 ID 与您的附加组件在 AMO 上的 ID 不匹配。`

### 3. 本地运行 web-ext lint

如果机器上有 Node.js，上传前建议执行：

```powershell
npx --yes web-ext lint --source-dir release\staging-firefox-<version>
```

示例：

```powershell
npx --yes web-ext lint --source-dir release\staging-firefox-1.1.3
```

当前可接受状态：

- `errors: 0`
- `notices: 0`
- `warnings`: 允许存在少量非阻塞告警

目前已知剩余的告警主要是 `innerHTML` 的安全提醒，不会阻止打包上传，但后续可以继续优化。

## 常见报错与处理

### 1. `Invalid file name in archive: config\app.config.js`

原因：

- ZIP 内部条目名使用了反斜杠。

处理：

- 不要使用 `Compress-Archive` 直接打 Firefox 包。
- 保持 `scripts/package.ps1` 中的自定义 ZIP 逻辑，将条目名统一转换为 `/`。

### 2. `Unsupported "/background/service_worker" manifest property used without "/background/scripts" property as Firefox-compatible fallback`

原因：

- Firefox 要求 `background.service_worker` 与 `background.scripts` 同时存在。

处理：

- 在 `manifest.firefox.json` 中保留：

```json
"background": {
  "scripts": ["background.js"],
  "service_worker": "background.js",
  "preferred_environment": ["document", "service_worker"],
  "type": "module"
}
```

### 3. `The add-on ID is required in Manifest Version 3 and above`

原因：

- Firefox MV3 扩展要求显式声明 `browser_specific_settings.gecko.id`。

处理：

- 保持以下配置存在：

```json
"browser_specific_settings": {
  "gecko": {
    "id": "ai-bookmark-organizer@youlai.com"
  }
}
```

### 4. `附加组件 ID 与您的附加组件在 AMO 上的 ID 不匹配`

原因：

- manifest 中的 `gecko.id` 与 AMO 现有条目 ID 不一致。

处理：

- 必须使用 AMO 条目的真实 ID：
  `ai-bookmark-organizer@youlai.com`

### 5. `strict_min_version` 与 manifest 字段支持版本不匹配

原因：

- manifest 中使用了更高版本才支持的 Firefox 字段，但 `strict_min_version` 写得过低。

处理：

- 目前保持：
  - 桌面 Firefox：`140.0`
  - Firefox Android：`142.0`

## 推荐发布流程

每次发布 Firefox 版时，按下面顺序执行：

1. 修改 `manifest.firefox.json` 中的版本号。
2. 检查 `gecko.id` 是否仍为 `ai-bookmark-organizer@youlai.com`。
3. 执行 Firefox 打包命令。
4. 检查生成的 ZIP 内部路径是否为 `/`。
5. 从 ZIP 中检查 manifest，确认 `gecko.id` 正确。
6. 运行 `web-ext lint` 做本地校验。
7. 将 `release/AIBook-firefox-<version>.zip` 上传到 AMO。

## 如果后续还遇到新的 AMO 拒绝项

建议按这个顺序排查：

1. 先看 AMO 报错是否是 `manifest` 层面的结构问题。
2. 再看是否是 ZIP 包格式问题。
3. 最后再处理代码级安全警告。

如果要继续新增 Firefox 兼容配置，优先只改 `manifest.firefox.json`，尽量不要影响 Chrome 用的 `manifest.json`。
