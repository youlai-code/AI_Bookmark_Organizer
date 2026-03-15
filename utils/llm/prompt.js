import {
  DEFAULT_RENAME_LENGTH,
  MAX_RENAME_LENGTH,
  MIN_RENAME_LENGTH,
  NON_CJK_MAX_CAP,
  NON_CJK_MULTIPLIER
} from './constants.js';

const TRACKING_QUERY_PARAM_PATTERNS = [
  /^utm_/i,
  /^spm$/i,
  /^from$/i,
  /^source$/i,
  /^src$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^igshid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^si$/i,
  /^feature$/i
];

const MEANINGFUL_QUERY_KEYS = new Set([
  'id',
  'p',
  'page',
  'q',
  'query',
  'search',
  'keyword',
  'keywords',
  'kw',
  'k',
  'tag',
  'name',
  'title',
  'v',
  'doc',
  'article',
  'category'
]);

const MAX_URL_QUERY_PARAMS = 4;
const MAX_URL_VALUE_LENGTH = 64;
const MAX_URL_TEXT_LENGTH = 180;
const MAX_BATCH_SIZE = 50;

export function normalizeRenameLength(maxRenameLength) {
  const parsed = Number.parseInt(maxRenameLength, 10);
  if (Number.isNaN(parsed)) return DEFAULT_RENAME_LENGTH;
  return Math.min(MAX_RENAME_LENGTH, Math.max(MIN_RENAME_LENGTH, parsed));
}

function getNonCjkMaxLength(cjkMaxLength) {
  return Math.min(NON_CJK_MAX_CAP, Math.max(cjkMaxLength, cjkMaxLength * NON_CJK_MULTIPLIER));
}

function clampText(value, maxLength) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function shouldDropQueryParam(key) {
  return TRACKING_QUERY_PARAM_PATTERNS.some((pattern) => pattern.test(key));
}

export function normalizeUrlForPrompt(rawUrl) {
  const fallback = clampText(rawUrl, MAX_URL_TEXT_LENGTH);
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);
    const queryParts = [];

    for (const [key, value] of url.searchParams.entries()) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || shouldDropQueryParam(normalizedKey)) continue;

      const normalizedValue = clampText(value, MAX_URL_VALUE_LENGTH);
      const shouldKeepValue = normalizedValue && MEANINGFUL_QUERY_KEYS.has(normalizedKey.toLowerCase());
      queryParts.push(shouldKeepValue ? `${normalizedKey}=${normalizedValue}` : normalizedKey);

      if (queryParts.length >= MAX_URL_QUERY_PARAMS) break;
    }

    const base = `${url.hostname}${url.pathname || ''}`.replace(/\/+$/, '') || url.hostname;
    const normalized = queryParts.length > 0 ? `${base}?${queryParts.join('&')}` : base;
    return clampText(normalized, MAX_URL_TEXT_LENGTH);
  } catch {
    return fallback;
  }
}

function normalizeFolderCreationLevel(folderCreationLevel) {
  let effectiveLevel = folderCreationLevel;

  if (typeof effectiveLevel === 'boolean') {
    effectiveLevel = effectiveLevel ? 'medium' : 'off';
  }
  if (!['off', 'weak', 'medium', 'strong'].includes(effectiveLevel)) {
    effectiveLevel = 'medium';
  }

  return effectiveLevel;
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
  const effectiveLevel = normalizeFolderCreationLevel(folderCreationLevel);
  const normalizedUrl = normalizeUrlForPrompt(url);
  const foldersStr = existingFolders.length > 0 ? existingFolders.join(', ') : (lang === 'en' ? 'None' : '无');
  const description = content.description || '';
  const keywords = content.keywords || '';
  const body = content.body || '';
  const nonCjkMaxLength = getNonCjkMaxLength(maxRenameLength);

  let strategyEn = '';
  let strategyZh = '';

  switch (effectiveLevel) {
    case 'off':
      strategyEn = 'Strictly choose from Existing Folders. Do not create new folders.';
      strategyZh = '严格从现有文件夹中选择，不要新建文件夹。';
      break;
    case 'weak':
      strategyEn = 'Prioritize Existing Folders. Create a new folder only if none fits.';
      strategyZh = '优先使用现有文件夹，只有明显不匹配时才新建。';
      break;
    case 'strong':
      strategyEn = 'Prioritize accuracy. Create a new folder when existing folders are not precise enough.';
      strategyZh = '优先保证准确性，现有文件夹不够贴切时可以新建。';
      break;
    case 'medium':
    default:
      strategyEn = 'Choose an existing folder if it fits well; otherwise create a relevant new folder.';
      strategyZh = '现有文件夹合适就使用，否则新建一个相关文件夹。';
      break;
  }

  const baseInfo = [
    `Page Title: ${title}`,
    `URL: ${normalizedUrl}`,
    `Description: ${description}`,
    `Keywords: ${keywords}`,
    `Body: ${body}`,
    `Existing Folders: ${foldersStr}`,
    `Folder Creation Strategy: ${effectiveLevel}`
  ].join('\n');

  if (lang === 'en') {
    return [
      'Analyze the bookmark information and choose the best category.',
      baseInfo,
      '',
      'Rules:',
      `1. Strategy: ${strategyEn}`,
      '2. Existing folders may include nested paths separated by "/". If matched, return the exact full path.',
      '3. If you create a new folder, use a short and specific category name.',
      '4. If uncertain, choose the closest existing folder or "Default".',
      enableRename
        ? `5. Return JSON ONLY: {"category":"Name","title":"Simplified Title"}. Keep Chinese/CJK titles <= ${maxRenameLength} chars; other titles <= ${nonCjkMaxLength} chars.`
        : '5. Return ONLY the category name.'
    ].join('\n');
  }

  return [
    '请根据以下网页信息为书签选择最合适的分类。',
    baseInfo,
    '',
    '规则：',
    `1. 策略：${strategyZh}`,
    '2. 现有文件夹可能是多级路径，分隔符为 "/"；如果命中，必须返回完整路径。',
    '3. 如果需要新建分类，请使用简短、明确的中文分类名。',
    '4. 如果不确定，优先选择最接近的现有文件夹，或返回“默认收藏”。',
    enableRename
      ? `5. 只返回 JSON：{"category":"分类名","title":"简化标题"}。中文/CJK 标题不超过 ${maxRenameLength} 个字符，非中文标题不超过 ${nonCjkMaxLength} 个字符。`
      : '5. 只返回分类名称，不要输出解释。'
  ].join('\n');
}

export function generateRenamePrompt(lang, title, url, maxRenameLength) {
  const normalizedUrl = normalizeUrlForPrompt(url);
  const nonCjkMaxLength = getNonCjkMaxLength(maxRenameLength);

  if (lang === 'en') {
    return [
      'Simplify the bookmark title without changing its meaning.',
      `Original Title: ${title}`,
      `URL: ${normalizedUrl}`,
      '',
      'Rules:',
      '1. Keep the core topic, product name, series name, and important qualifiers.',
      '2. Remove site suffixes, repeated fragments, filler words, and obvious noise.',
      '3. If the title is already concise and clear, keep it close to the original.',
      `4. Chinese/CJK titles must be <= ${maxRenameLength} chars; other titles must be <= ${nonCjkMaxLength} chars.`,
      '5. Return JSON ONLY: {"title":"Simplified Title"}'
    ].join('\n');
  }

  return [
    '请在不改变原意的前提下，简化这个书签标题。',
    `原始标题：${title}`,
    `URL：${normalizedUrl}`,
    '',
    '规则：',
    '1. 保留核心主题、产品名、系列名和必要限定词。',
    '2. 删除站点后缀、重复片段、营销词和明显噪音。',
    '3. 如果标题本身已经简洁清晰，就尽量少改。',
    `4. 中文/CJK 标题不超过 ${maxRenameLength} 个字符，非中文标题不超过 ${nonCjkMaxLength} 个字符。`,
    '5. 只返回 JSON：{"title":"简化标题"}'
  ].join('\n');
}

export function generateBatchClassifyPrompt(
  lang,
  bookmarks,
  existingFolders,
  folderCreationLevel,
  enableRename,
  maxRenameLength
) {
  const effectiveLevel = normalizeFolderCreationLevel(folderCreationLevel);
  const foldersStr = existingFolders.length > 0 ? existingFolders.join(', ') : (lang === 'en' ? 'None' : '无');
  const nonCjkMaxLength = getNonCjkMaxLength(maxRenameLength);

  let strategyEn = '';
  let strategyZh = '';

  switch (effectiveLevel) {
    case 'off':
      strategyEn = 'Strictly choose from Existing Folders. Do not create new folders.';
      strategyZh = '严格从现有文件夹中选择，不要新建文件夹。';
      break;
    case 'weak':
      strategyEn = 'Prioritize Existing Folders. Create a new folder only if none fits.';
      strategyZh = '优先使用现有文件夹，只有明显不匹配时才新建。';
      break;
    case 'strong':
      strategyEn = 'Prioritize accuracy. Create a new folder when existing folders are not precise enough.';
      strategyZh = '优先保证准确性，现有文件夹不够贴切时可以新建。';
      break;
    case 'medium':
    default:
      strategyEn = 'Choose an existing folder if it fits well; otherwise create a relevant new folder.';
      strategyZh = '现有文件夹合适就使用，否则新建一个相关文件夹。';
      break;
  }

  const bookmarkItems = bookmarks.map((bm, idx) => {
    const normalizedUrl = normalizeUrlForPrompt(bm.url);
    return [
      `[${idx}]`,
      `  Title: ${bm.title}`,
      `  URL: ${normalizedUrl}`,
      bm.description ? `  Description: ${bm.description}` : null,
      bm.keywords ? `  Keywords: ${bm.keywords}` : null,
      bm.body ? `  Body: ${clampText(bm.body, 500)}` : null
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  if (lang === 'en') {
    return [
      'Analyze the following bookmarks and choose the best category for each.',
      '',
      `Existing Folders: ${foldersStr}`,
      `Folder Creation Strategy: ${effectiveLevel}`,
      '',
      'Bookmarks:',
      bookmarkItems,
      '',
      'Rules:',
      `1. Strategy: ${strategyEn}`,
      '2. Existing folders may include nested paths separated by "/". If matched, return the exact full path.',
      '3. If you create a new folder, use a short and specific category name.',
      '4. If uncertain, choose the closest existing folder or "Default".',
      enableRename
        ? `5. Return JSON array ONLY. Each item: {"index":0,"category":"Name","title":"Simplified Title"}. Chinese/CJK titles <= ${maxRenameLength} chars; other titles <= ${nonCjkMaxLength} chars.`
        : '5. Return JSON array ONLY. Each item: {"index":0,"category":"Name"}.',
      '6. Process ALL bookmarks. Do not skip any.'
    ].join('\n');
  }

  return [
    '请根据以下书签信息为每个书签选择最合适的分类。',
    '',
    `现有文件夹：${foldersStr}`,
    `文件夹创建策略：${effectiveLevel}`,
    '',
    '书签列表：',
    bookmarkItems,
    '',
    '规则：',
    `1. 策略：${strategyZh}`,
    '2. 现有文件夹可能是多级路径，分隔符为 "/"；如果命中，必须返回完整路径。',
    '3. 如果需要新建分类，请使用简短、明确的中文分类名。',
    '4. 如果不确定，优先选择最接近的现有文件夹，或返回"默认收藏"。',
    enableRename
      ? `5. 只返回 JSON 数组。每项格式：{"index":0,"category":"分类名","title":"简化标题"}。中文/CJK 标题不超过 ${maxRenameLength} 个字符，非中文标题不超过 ${nonCjkMaxLength} 个字符。`
      : '5. 只返回 JSON 数组。每项格式：{"index":0,"category":"分类名"}。',
    '6. 必须处理所有书签，不要遗漏。'
  ].join('\n');
}

export function generateBatchRenamePrompt(lang, bookmarks, maxRenameLength) {
  const nonCjkMaxLength = getNonCjkMaxLength(maxRenameLength);

  const bookmarkItems = bookmarks.map((bm, idx) => {
    const normalizedUrl = normalizeUrlForPrompt(bm.url);
    return `[${idx}] Title: ${bm.title}\n    URL: ${normalizedUrl}`;
  }).join('\n');

  if (lang === 'en') {
    return [
      'Simplify the following bookmark titles without changing their meanings.',
      '',
      'Bookmarks:',
      bookmarkItems,
      '',
      'Rules:',
      '1. Keep the core topic, product name, series name, and important qualifiers.',
      '2. Remove site suffixes, repeated fragments, filler words, and obvious noise.',
      '3. If a title is already concise and clear, keep it close to the original.',
      `4. Chinese/CJK titles must be <= ${maxRenameLength} chars; other titles must be <= ${nonCjkMaxLength} chars.`,
      '5. Return JSON array ONLY. Each item: {"index":0,"title":"Simplified Title"}',
      '6. Process ALL bookmarks. Do not skip any.'
    ].join('\n');
  }

  return [
    '请在不改变原意的前提下，简化以下书签标题。',
    '',
    '书签列表：',
    bookmarkItems,
    '',
    '规则：',
    '1. 保留核心主题、产品名、系列名和必要限定词。',
    '2. 删除站点后缀、重复片段、营销词和明显噪音。',
    '3. 如果标题本身已经简洁清晰，就尽量少改。',
    `4. 中文/CJK 标题不超过 ${maxRenameLength} 个字符，非中文标题不超过 ${nonCjkMaxLength} 个字符。`,
    '5. 只返回 JSON 数组。每项格式：{"index":0,"title":"简化标题"}',
    '6. 必须处理所有书签，不要遗漏。'
  ].join('\n');
}

export { MAX_BATCH_SIZE };
