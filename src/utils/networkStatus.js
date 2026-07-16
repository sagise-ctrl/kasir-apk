let _isOnline = true;

export function setOnlineStatus(status) {
  _isOnline = status;
}

export function isOnline() {
  return _isOnline;
}
