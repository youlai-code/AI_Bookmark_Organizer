export function parseResponse(text, originalTitle, enableRename) {
  let category = 'Default';
  let title = originalTitle;

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.category) category = obj.category;
      if (obj.title && enableRename) title = obj.title;
    } else {
      category = text.replace(/["'。，]/g, '').trim();
    }
  } catch {
    category = text.replace(/["'。，]/g, '').trim();
  }

  if (enableRename) {
    title = (title || '').trim() || (originalTitle || '').trim();
  }

  return { category, title: enableRename ? title : originalTitle };
}
