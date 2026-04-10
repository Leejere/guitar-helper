class ResponsiveState {
  windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1400);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.windowWidth = window.innerWidth;
      });
    }
  }
}

export const responsive = new ResponsiveState();
