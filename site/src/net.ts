// What a failed request says to an owner: a dropped connection in plain words (browsers word it 'Failed to fetch',
// 'NetworkError when attempting to fetch resource.' or 'Load failed'), any other error as the server put it.
const OFFLINE = /failed to fetch|networkerror|load failed|network request failed/i;

export const plainError = (error: { message: string }) =>
  OFFLINE.test(error.message) ? 'No connection: check your internet and try again.' : error.message;
