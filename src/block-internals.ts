import {
  AbstractOutput,
  OutputFactory,
  UserBlock,
  Block,
  Host,
  RENDER,
  logUpdaters,
} from "./interfaces";
import type { CursorRange, Operations } from "./ops";
// eslint-disable-next-line import/no-cycle
import { Output } from "./output";
import { Freshness, unsafeCompute } from "./unsafe";
import {
  Updater,
  pollUpdaters,
  PresentUpdaters,
  toPresentUpdaters,
  POLL,
} from "./update";
import {
  DebugFields,
  DEBUG,
  LogLevel,
  Structured,
  newtype,
  struct,
  printStructured,
} from "./debug";

export function render<Ops extends Operations>(
  block: Block<Ops>,
  output: AbstractOutput<Ops>,
  host: Host
): Updater | void {
  let level = isInternal(block) ? LogLevel.Internals : LogLevel.Info;

  host.begin(level, `rendering ${printStructured(block[DEBUG](), true)}`);

  let result = host.indent(level, () => block[RENDER](output, host));
  host.end(level, `rendering ${printStructured(block[DEBUG](), false)}`);
  return result;
}

/**
 * A `DynamicBlock` is torn down whenever any part of the computation that
 * wasn't already covered by an `Updater` changes.
 *
 * For example, when the condition of an `if` block changes, the block is
 * torn down and re-created.
 *
 * `DynamicBlock` is not part of the core block calculus (see `block.md`).
 * Rather, it is an implementation detail of the block primitives.
 */
export class DynamicBlock<Ops extends Operations> implements Block<Ops> {
  static render<Ops extends Operations>(
    block: UserBlock<Ops>,
    output: AbstractOutput<Ops>,
    host: Host
  ): Updater | void {
    let dynamic = new DynamicBlock(block);
    return render(dynamic, output, host);
  }

  #userBlock: UserBlock<Ops>;

  private constructor(userBlock: UserBlock<Ops>) {
    this.#userBlock = userBlock;
  }

  [DEBUG](): Structured {
    return newtype("DynamicBlock", this.#userBlock.desc);
  }

  get debugFields(): DebugFields {
    return new DebugFields("DynamicBlock", {
      invoke: this.#userBlock,
    });
  }

  [RENDER](output: AbstractOutput<Ops>, host: Host): Updater {
    let updaters: Updater[] = [];
    let append = new Output(output, updaters, host);

    let {
      range,
      value: { freshness },
    } = output.range(() =>
      unsafeCompute(() => this.#userBlock.invoke(append, output))
    );

    logUpdaters(updaters, host);

    return new DynamicBlockResult(
      this,
      output.getOutput(),
      toPresentUpdaters(updaters),
      range,
      freshness
    );
  }
}

export function isInternal<Ops extends Operations>(block: Block<Ops>): boolean {
  return block instanceof DynamicBlock;
}

export class DynamicBlockResult<Ops extends Operations> implements Updater {
  // The block that should be rendered if `#freshness` is stale and the
  // block needs to be rebuilt.
  readonly #block: DynamicBlock<Ops>;

  readonly #Output: OutputFactory<Ops>;

  readonly #updaters: PresentUpdaters | void;

  // A region of the output.
  readonly #range: CursorRange<Ops>;

  readonly #freshness: Freshness;

  constructor(
    block: DynamicBlock<Ops>,
    Output: OutputFactory<Ops>,
    updaters: PresentUpdaters | void,
    range: CursorRange<Ops>,
    freshness: Freshness
  ) {
    this.#block = block;
    this.#Output = Output;
    this.#updaters = updaters;
    this.#range = range;
    this.#freshness = freshness;
  }

  get debugFields(): DebugFields {
    return new DebugFields("BlockResult", {
      block: this.#block,
      Output: this.#Output,
      updaters: this.#updaters,
      range: this.#range,
      freshness: this.#freshness,
    });
  }

  [DEBUG](): Structured {
    return struct("DynamicBlockResult", ["block", this.#block[DEBUG]()]);
  }

  [POLL](host: Host): Updater | void {
    if (this.#freshness.isStale) {
      host.logResult(LogLevel.Info, `stale, rerendering`);

      // Clear the range in the output that this block corresponds to,
      // getting a new cursor to insert the content at.
      let cursor = this.#range.clear();

      // And run the block again, inserting new content at the cursor.
      return render(this.#block, this.#Output(cursor), host);
    } else if (this.#updaters) {
      host.logResult(LogLevel.Info, "fresh, polling updaters");
      let updaters = pollUpdaters(this.#updaters, host);

      return new DynamicBlockResult(
        this.#block,
        this.#Output,
        updaters,
        this.#range,
        this.#freshness
      );
    } else {
      host.logResult(LogLevel.Info, "fresh, no updaters to poll");
      return this;
    }
  }
}