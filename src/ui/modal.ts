/**
 * Accessible Modal Controller
 */

export class ModalManager {
  private activeModal: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal(this.activeModal.id);
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  public openModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Close any currently active modal
    if (this.activeModal && this.activeModal !== modal) {
      this.closeModal(this.activeModal.id);
    }

    this.activeModal = modal;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    // Focus first input or button in modal
    requestAnimationFrame(() => {
      const focusable = modal.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      }
    });
  }

  public closeModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('hidden');
    if (this.activeModal === modal) {
      this.activeModal = null;
    }

    if (!document.querySelector('.modal:not(.hidden)')) {
      document.body.classList.remove('overflow-hidden');
    }
  }

  public isAnyOpen(): boolean {
    return this.activeModal !== null;
  }
}

export const modalManager = new ModalManager();
