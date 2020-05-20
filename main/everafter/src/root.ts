import type { Evaluate } from "./builder";
import {
  caller,
  DEBUG,
  LogLevel,
  newtype,
  PARENT,
  Structured,
  getSource,
} from "./debug/index";
import type { Host, UserBlock, AppendingReactiveRange } from "./interfaces";
import { Region } from "./region";
import { Updater, poll } from "./update";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Cursor, Atom> {
  #program: UserBlock<Cursor, Atom>;
  #host: Host;
  #update: Updater | void = undefined;

  constructor(program: Evaluate<Cursor, Atom>, host: Host) {
    this.#program = program;
    this.#host = host;
  }

  [DEBUG](): Structured {
    return newtype("RootBlock", getSource(this.#program));
  }

  render(
    cursor: AppendingReactiveRange<Cursor, Atom>,
    source = caller(PARENT, "initial render")
  ): Updater | void {
    this.#host.context(LogLevel.Info, source, () => {
      this.#update = this.#host.indent(LogLevel.Info, () =>
        Region.render(this.#program, cursor, this.#host)
      );
    });
  }

  rerender(source = caller(PARENT, "re-rendering")): void {
    this.#host.context(LogLevel.Info, source, () => {
      if (this.#update) {
        this.#update = poll(this.#update, this.#host);
      } else {
        this.#host.logResult(LogLevel.Info, "nothing to do, no updaters");
      }
    });
  }
}
