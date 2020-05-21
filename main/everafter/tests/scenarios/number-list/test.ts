import {
  annotate,
  call,
  caller,
  Cell,
  CompiledProgram,
  Compiler,
  Derived,
  Dict,
  Param,
  PARENT,
  ReactiveParameters,
  RootBlock,
  Var,
} from "everafter";
import type * as qunit from "qunit";
import { host, module, test } from "../../helpers";
import {
  ArrayAtom,
  ArrayCursor,
  ArrayRange,
  CompileNumberArrayOps,
  num,
} from "./output";

@module("list of numbers")
export class ListOfNumbersTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple number list"(): void {
    const compiler = Compiler.for(
      {
        first: Param<number>(),
        second: Param<number>(),
        third: Param<number>(),
        sum: Param<number>(),
      },
      this.#host,
      new CompileNumberArrayOps()
    );

    const sum = annotate(
      (first: Var<number>, second: Var<number>, third: Var<number>): number =>
        first.current + second.current + third.current
    );

    const program = compiler.compile((p, { first, second, third, sum }) => {
      p.atom(num(first));
      p.atom(num(second));
      p.atom(num(third));
      p.atom(num(sum));
    });

    const first = Cell(10);
    const second = Cell(20);
    const third = Cell(30);

    let result = this.render(program, {
      first,
      second,
      third,
      sum: Derived(() => sum(first, second, third)),
    }).expect([10, 20, 30, 60]);

    result.rerender();

    result.update(() => {
      first.current = 15;
      third.current = 50;
    }, [15, 20, 50, 85]);
  }

  @test blocks(): void {
    const compiler = Compiler.for(
      {
        "positive.first": Param<number>(),
        "positive.second": Param<number>(),
        "positive.third": Param<number>(),
        "positive.sum": Param<number>(),
        "negative.first": Param<number>(),
        "negative.second": Param<number>(),
        "negative.third": Param<number>(),
        "negative.sum": Param<number>(),
        showPositive: Param<boolean>(),
        showAbs: Param<boolean>(),
      },
      this.#host,
      new CompileNumberArrayOps()
    );

    const positiveSum = annotate(
      (first: Var<number>, second: Var<number>, third: Var<number>): number =>
        first.current + second.current + third.current
    );

    const negativeSum = annotate(
      (first: Var<number>, second: Var<number>, third: Var<number>): number =>
        Math.abs(first.current) +
        Math.abs(second.current) +
        Math.abs(third.current)
    );

    const abs = annotate((num: Var<number>): number => Math.abs(num.current));

    const program = compiler.compile((b, params) => {
      b.ifBlock(
        params.showPositive,
        annotate(b => {
          b.ifBlock(
            params.showAbs,
            annotate(b => {
              b.atom(num(call(abs, params["positive.first"])));
              b.atom(num(call(abs, params["positive.second"])));
              b.atom(num(call(abs, params["positive.third"])));
              b.atom(num(call(abs, params["positive.sum"])));
            }),
            annotate(b => {
              b.atom(num(params["positive.first"]));
              b.atom(num(params["positive.second"]));
              b.atom(num(params["positive.third"]));
              b.atom(num(params["positive.sum"]));
            })
          );
        }),
        annotate(b => {
          b.ifBlock(
            params["showAbs"],
            annotate(b => {
              b.atom(num(call(abs, params["negative.first"])));
              b.atom(num(call(abs, params["negative.second"])));
              b.atom(num(call(abs, params["negative.third"])));
              b.atom(num(call(abs, params["negative.sum"])));
            }),
            annotate(b => {
              b.atom(num(params["negative.first"]));
              b.atom(num(params["negative.second"]));
              b.atom(num(params["negative.third"]));
              b.atom(num(params["negative.sum"]));
            })
          );
        })
      );
    });

    const firstPos = Cell(10);
    const secondPos = Cell(20);
    const thirdPos = Cell(30);
    const firstNeg = Cell(-10);
    const secondNeg = Cell(-20);
    const thirdNeg = Cell(-30);
    const showPositive = Cell(true);
    const showAbs = Cell(false);

    let result = this.render(program, {
      "positive.first": firstPos,
      "positive.second": secondPos,
      "positive.third": thirdPos,
      "positive.sum": Derived(() => positiveSum(firstPos, secondPos, thirdPos)),
      "negative.first": firstNeg,
      "negative.second": secondNeg,
      "negative.third": thirdNeg,
      "negative.sum": Derived(() => negativeSum(firstNeg, secondNeg, thirdNeg)),
      showPositive,
      showAbs,
    }).expect([10, 20, 30, 60]);

    result.rerender();

    result.update(() => {
      firstPos.current = 15;
      thirdPos.current = 50;
    }, [15, 20, 50, 85]);

    result.update(() => {
      showPositive.current = false;
    }, [-10, -20, -30, 60]);

    result.update(() => {
      showAbs.current = true;
    }, [10, 20, 30, 60]);
  }

  private render<A extends Dict<Var>>(
    program: CompiledProgram<ArrayCursor, ArrayAtom, ReactiveParameters>,
    state: A
  ): RenderExpectation {
    this.assert.step("initial render");
    let list: number[] = [];
    let root = program.render(state, ArrayRange.from(list, this.#host));
    return new RenderExpectation(root, list, this.assert);
  }
}

class RenderExpectation {
  #invocation: RootBlock<ArrayCursor, ArrayAtom>;
  #list: number[];
  #assert: qunit.Assert;
  #last: readonly number[] | undefined = undefined;

  constructor(
    invocation: RootBlock<ArrayCursor, ArrayAtom>,
    list: number[],
    assert: qunit.Assert
  ) {
    this.#invocation = invocation;
    this.#list = list;
    this.#assert = assert;
  }

  expect(expected: readonly number[]): this {
    this.assertList(expected);
    this.#assert.verifySteps(["initial render"], "initial render: done");
    return this;
  }

  rerender(): void {
    this.#assert.step("no-op rerender");
    this.#invocation.rerender(caller(PARENT));

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertList(this.#last);
    this.#assert.verifySteps(["no-op rerender"], "no-op rerender: done");
  }

  update(callback: () => void, expected: readonly number[]): void {
    this.#assert.step("updating");
    callback();
    this.#invocation.rerender(caller(PARENT));
    this.assertList(expected);
    this.#assert.verifySteps(["updating"], "updating: done");
  }

  private assertList(expected: readonly number[]): void {
    this.#last = expected;
    this.#assert.deepEqual(this.#list, expected, JSON.stringify(expected));
  }
}