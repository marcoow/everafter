import type { Evaluate } from "./builder";
import {
  caller,
  DEBUG,
  LogLevel,
  newtype,
  PARENT,
  Structured,
  getSource,
  annotate,
  description,
} from "./debug/index";
import type { AppendingReactiveRange } from "./interfaces";
import { Region } from "./region";
import { Updater, poll } from "./update";
import { initializeEffect } from "./effect";
import { getOwner, Owned, OWNED, Owner } from "./owner";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Cursor, Atom> extends Owned {
  #program: Evaluate<Cursor, Atom>;
  #update: Updater | void = undefined;

  constructor(owner: Owner, program: Evaluate<Cursor, Atom>) {
    super(owner);
    this.#program = program;
  }

  [DEBUG](): Structured {
    return description("RootBlock");
  }

  render(cursor: AppendingReactiveRange<Cursor, Atom>): Updater | void {
    let owner = getOwner(cursor);
    let host = owner.host;

    this.#update = owner.instantiate(initializeEffect, {
      initialize: () =>
        host.context(LogLevel.Info, description("RootBlock"), () =>
          host.indent(LogLevel.Info, () =>
            owner.instantiate(Region.render, this.#program, cursor)
          )
        ),
      update: (updater: Updater | void) => {
        host.context(LogLevel.Info, description("re-rendering"), () => {
          if (updater) {
            poll(updater);
          } else {
            host.logResult(LogLevel.Info, "nothing to do, no updaters");
          }
        });
      },
    });
  }

  rerender(): void {
    let host = getOwner(this).host;

    host.context(LogLevel.Info, description("rerendering"), () => {
      if (this.#update) {
        poll(this.#update);
      } else {
        host.logResult(LogLevel.Info, "nothing to do, no updaters");
      }
    });
  }
}
