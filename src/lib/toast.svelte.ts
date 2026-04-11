const DURATION = 1500;

class ToastState {
  message: string = $state('');
  visible: boolean = $state(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(msg: string) {
    if (this.timer) clearTimeout(this.timer);
    this.message = msg;
    this.visible = true;
    this.timer = setTimeout(() => {
      this.visible = false;
      this.timer = null;
    }, DURATION);
  }
}

export const toast = new ToastState();
