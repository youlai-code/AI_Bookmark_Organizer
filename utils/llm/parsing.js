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

export function parseBatchResponse(text, bookmarks, enableRename) {
  const results = new Map();

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        // 检查是否所有项都有index字段
        const allHaveIndex = arr.every(item => typeof item.index === 'number');
        
        if (allHaveIndex) {
          // 如果所有项都有index字段，按照index映射
          for (const item of arr) {
            const idx = item.index;
            if (idx >= 0 && idx < bookmarks.length) {
              const bm = bookmarks[idx];
              results.set(idx, {
                category: item.category || 'Default',
                title: enableRename
                  ? (item.title || '').trim() || bm.title
                  : bm.title
              });
            }
          }
        } else {
          // 如果没有index字段，按照数组顺序映射
          for (let i = 0; i < arr.length && i < bookmarks.length; i++) {
            const item = arr[i];
            const bm = bookmarks[i];
            results.set(i, {
              category: item.category || 'Default',
              title: enableRename
                ? (item.title || '').trim() || bm.title
                : bm.title
            });
          }
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  for (let i = 0; i < bookmarks.length; i++) {
    if (!results.has(i)) {
      results.set(i, {
        category: 'Default',
        title: enableRename ? bookmarks[i].title : bookmarks[i].title
      });
    }
  }

  return results;
}
