export class LogUtil {
  constructor(private isDebug = false) {}

  log(...args: any[]) {
    if (this.isDebug) {
      console.log(...args);
    }
  }

  error(...args: any[]) {
    if (this.isDebug) {
      console.log(...args);
    }
  }
}
