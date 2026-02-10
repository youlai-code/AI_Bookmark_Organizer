
export async function addHistoryItem(item) {
  const { history } = await chrome.storage.local.get({ history: [] });
  
  const newItem = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    title: item.title,
    url: item.url,
    category: item.category,
    status: item.status || 'success'
  };

  // Add to beginning
  history.unshift(newItem);

  // Limit to last 100 items
  if (history.length > 100) {
    history.length = 100;
  }

  await chrome.storage.local.set({ history });
}

export async function getHistoryItems() {
  const { history } = await chrome.storage.local.get({ history: [] });
  return history;
}

export async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
}
