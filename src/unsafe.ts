import {
  beginTrackFrame,
  consumeTag,
  endTrackFrame,
  isConstTag,
  validateTag,
  valueForTag,
} from "@glimmer/validator";
import type { Tag } from "@glimmer/validator/dist/types";
import type { Updater } from "./update";
import { DebugFields, unreachable, unwrap } from "./utils";

export class UnsafeDirtyTrack<T> {
  #callback: () => T;
  #tag: Tag | null = null;
  #snapshot = -1;
  #lastValue: T | null = null;

  constructor(callback: () => T) {
    this.#callback = callback;
  }

  compute(): T {
    if (this.#tag && validateTag(this.#tag, this.#snapshot)) {
      consumeTag(this.#tag);
    } else {
      beginTrackFrame();

      try {
        this.#lastValue = this.#callback();
      } finally {
        let tag = endTrackFrame();
        this.#tag = tag;
        this.#snapshot = valueForTag(tag);
      }
    }

    return unwrap(this.#lastValue);
  }

  get isConst(): boolean {
    if (this.#tag === null) {
      throw new Error(
        `invariant: can't check isDirty before computing the value`
      );
    }

    return isConstTag(this.#tag);
  }

  get isDirty(): boolean {
    if (this.#tag === null) {
      throw new Error(
        `invariant: can't check isDirty before computing the value`
      );
    }

    return validateTag(this.#tag, this.#snapshot);
  }
}

export class UnsafeUpdatable {
  #initialize: () => Updater;
  #update: Updater | void = undefined;
  #tag: Tag | null = null;
  #snapshot = -1;

  constructor(initialize: () => Updater) {
    this.#initialize = initialize;
  }

  initialize(): "const" | "mutable" {
    beginTrackFrame();

    let update: Updater | typeof UNDEFINED = UNDEFINED;

    try {
      update = this.#initialize();
    } finally {
      let tag = endTrackFrame();
      this.#tag = tag;
      this.#snapshot = valueForTag(tag);

      if (isConstTag(tag)) {
        return "const";
      } else if (update !== UNDEFINED) {
        this.#update = update;
        consumeTag(tag);
        return "mutable";
      } else {
        // this can only happen if the `try` block didn't
        // complete successfully, which means the whole
        // function returns an exception
        unreachable(null as never);
      }
    }
  }

  poll(): "const" | "mutable" {
    if (this.#tag === null || this.#update === null) {
      throw new Error(`invariant: Can only poll after initializing`);
    } else if (this.#tag && validateTag(this.#tag, this.#snapshot)) {
      return "mutable";
    } else {
      beginTrackFrame();

      try {
        if (this.#update === undefined) {
          throw new Error(`cannot poll an UnsafeUpdatable that was const`);
        }

        this.#update = this.#update.poll();

        if (this.#update === undefined) {
          return "const";
        } else {
          return "mutable";
        }
      } finally {
        let tag = endTrackFrame();
        this.#tag = tag;
        this.#snapshot = valueForTag(tag);
      }
    }
  }
}

/**
 * This class represents a single bit of information: whether the input values
 * for a particular computation changed for a given execution of that computation.
 */
export class Freshness {
  #tag: Tag;
  #snapshot: number;

  constructor(tag: Tag, snapshot: number) {
    this.#tag = tag;
    this.#snapshot = snapshot;
  }

  get isConst(): boolean {
    return isConstTag(this.#tag);
  }

  get debugFields(): DebugFields {
    return new DebugFields("ValidComputation", {
      tag: this.#tag,
      snapshot: this.#snapshot,
    });
  }

  get isStale(): boolean {
    return !validateTag(this.#tag, this.#snapshot);
  }
}

const UNDEFINED = Symbol("UNDEFINED");

export function unsafeCompute<T>(
  callback: () => T
): { freshness: Freshness; value: T } {
  beginTrackFrame();

  let value: T | typeof UNDEFINED = UNDEFINED;

  try {
    value = callback();
  } finally {
    let tag = endTrackFrame();
    let snapshot = valueForTag(tag);

    if (value !== UNDEFINED) {
      return { freshness: new Freshness(tag, snapshot), value };
    } else {
      unreachable(null as never);
    }
  }
}