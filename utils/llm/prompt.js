import {
  DEFAULT_RENAME_LENGTH,
  MAX_RENAME_LENGTH,
  MIN_RENAME_LENGTH,
  NON_CJK_MAX_CAP,
  NON_CJK_MULTIPLIER
} from './constants.js';

export function normalizeRenameLength(maxRenameLength) {
  const parsed = Number.parseInt(maxRenameLength, 10);
  if (Number.isNaN(parsed)) return DEFAULT_RENAME_LENGTH;
  return Math.min(MAX_RENAME_LENGTH, Math.max(MIN_RENAME_LENGTH, parsed));
}

function getNonCjkMaxLength(cjkMaxLength) {
  return Math.min(NON_CJK_MAX_CAP, Math.max(cjkMaxLength, cjkMaxLength * NON_CJK_MULTIPLIER));
}

export function generatePrompt(
  lang,
  title,
  url,
  content,
  existingFolders,
  folderCreationLevel,
  enableRename,
  maxRenameLength
) {
  let effectiveLevel = folderCreationLevel;

  if (typeof effectiveLevel === 'boolean') {
    effectiveLevel = effectiveLevel ? 'medium' : 'off';
  }
  if (!['off', 'weak', 'medium', 'strong'].includes(effectiveLevel)) {
    effectiveLevel = 'medium';
  }

  const foldersStr = existingFolders.length > 0 ? existingFolders.join(', ') : (lang === 'en' ? 'None' : '无');
  const description = content.description || '';
  const keywords = content.keywords || '';
  const body = content.body || '';

  let strategyEn = '';
  let strategyZh = '';

  switch (effectiveLevel) {
    case 'off':
      strategyEn = 'Strictly choose from "Existing Folders". Do NOT create new folders.';
      strategyZh = '严格从“Existing Folders”中选择。禁止新建文件夹。';
      break;
    case 'weak':
      strategyEn = 'Prioritize "Existing Folders". Only create a new folder if the content is completely unrelated to any existing ones.';
      strategyZh = '优先使用现有文件夹。只有在内容与现有文件夹完全无关时才新建。';
      break;
    case 'strong':
      strategyEn = 'Create a new specific folder if the existing ones are not a perfect fit. Prioritize accuracy.';
      strategyZh = '如果现有文件夹不够精准，请积极新建文件夹。优先保证分类准确性。';
      break;
    case 'medium':
    default:
      strategyEn = 'Choose an existing folder if it fits well. Otherwise, create a new relevant folder.';
      strategyZh = '如果现有文件夹合适则使用，否则新建一个相关文件夹。';
      break;
  }

  const baseInfo = `
Page Title: ${title}
URL: ${url}
Description: ${description}
Keywords: ${keywords}
Body: ${body}
Existing Folders: ${foldersStr}
Folder Creation Strategy: ${effectiveLevel}
`;

  const nonCjkMaxLength = getNonCjkMaxLength(maxRenameLength);

  if (lang === 'en') {
    return `Analyze the web page info and categorize it.
${baseInfo}

Rules:
1. Strategy: ${strategyEn}
2. Existing folders may include hierarchical paths separated by "/" (e.g., Programming/C#). If matched, return the exact full path.
3. If creating new: use a short (1-3 words) English category (e.g., Tech, News).
4. Fallback: If not allowed to create new or unsure, pick closest existing or "Default".
${enableRename ? `5. JSON Output ONLY: {"category": "Name", "title": "Simplified Title"}. If title is primarily Chinese/CJK, keep it <= ${maxRenameLength} chars; otherwise <= ${nonCjkMaxLength} chars.` : '5. Output ONLY the category name.'}`;
  }

  return `请分析网页信息并进行书签分类。${baseInfo}

规则：
1. 策略：${strategyZh}
2. 现有分类可能包含层级路径，分隔符为 "/"（例如：编程学习/C#学习）。若命中现有分类，必须返回完整路径。
3. 新建分类：如需新建，请返回简短中文分类（如：技术文档、新闻）。
4. 兜底：若不满足新建条件，强制选最接近的现有分类，或返回“默认收藏”。
${enableRename ? `5. 必须返回 JSON 格式：{"category": "分类名", "title": "简化标题"}。若标题以中文/CJK 为主，title 长度不得超过 ${maxRenameLength} 个字符；非中文标题不得超过 ${nonCjkMaxLength} 个字符。` : '5. 仅返回分类名称，无其他废话。'}`;
}
