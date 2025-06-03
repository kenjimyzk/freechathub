import { ofetch } from 'ofetch'

const plausibleApiHost = import.meta.env.VITE_PLAUSIBLE_API_HOST || 'https://plausible.io'

async function trackEvent(name: string, props: object) {
  await ofetch(`${plausibleApiHost}/api/event`, {
    method: 'POST',
    body: {
      domain: 'chathub.gg',
      name,
      url: location.href,
      props,
    },
    mode: 'no-cors',
  })
}

export async function trackInstallSource() {
  let source = 'unknown'; // Default value
  try {
    // Explicitly type the expected response for ofetch for clarity
    const response = await ofetch<{ source: string }>('https://chathub.gg/api/user/source', {
      credentials: 'include',
    });
    if (response && typeof response.source === 'string' && response.source.trim() !== '') {
      source = response.source;
    } else {
      console.warn('[ChatHub] trackInstallSource: API response did not contain a valid source string. Response:', response);
      source = 'invalid_response';
    }
  } catch (error: any) {
    console.warn('[ChatHub] trackInstallSource: Failed to fetch install source. Error:', error.message ? error.message : error);
    // Check if the error object has a response with a status (common with ofetch for HTTP errors)
    if (error.response && error.response.status) {
        source = `fetch_error_${error.response.status}`;
    } else if (error.message && error.message.includes('Failed to fetch')) {
        source = 'fetch_error_network'; // Specific for network failures not resulting in HTTP status
    }
    else {
        source = 'fetch_error_unknown';
    }
  }
  trackEvent('install', { source, language: navigator.language });
}
