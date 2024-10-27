export async function fetchWrapper(url: string, type: string, options = {}) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    if (type === 'text') {
      return await response.text();
    }
    if (type === 'arrayBuffer') {
      return await response.arrayBuffer();
    }

    return await response.json();
  } catch (error: any) {
    console.error('Fetch error:', error.message);
    throw error;
  }
}
