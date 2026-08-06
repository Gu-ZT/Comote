type ComoteDomElement = HTMLElement
  & Partial<HTMLInputElement>
  & Partial<HTMLFormElement>
  & Partial<HTMLSelectElement>
  & Partial<HTMLTextAreaElement>
  & Partial<HTMLAnchorElement>;

interface Document {
  querySelector<E extends Element = ComoteDomElement>(selectors: string): E | null;
  querySelectorAll<E extends Element = ComoteDomElement>(selectors: string): NodeListOf<E>;
  getElementById(elementId: string): ComoteDomElement | null;
}

interface Element {
  href: string;
  title: string;
  elements: HTMLFormControlsCollection;
  hidden: any;
}

interface EventTarget {
  closest?(selectors: string): Element | null;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  dataset?: DOMStringMap;
  textContent?: string | null;
  click?(): void;
  focus?(): void;
  reportValidity?(): boolean;
  reset?(): void;
}

interface Event {
  key?: string;
}

interface Error {
  status?: number;
}

interface Window {
  __TAURI__?: {
    core?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  ComoteChannelIcons?: Record<string, string>;
}
