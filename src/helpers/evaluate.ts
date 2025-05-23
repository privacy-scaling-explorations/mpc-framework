import { Circuit } from 'mpc-framework-common';

export default function evaluate<T>(
  circuit: Circuit,
  inputs: Record<string, unknown>,
  arithmetic: Arithmetic<T>,
): Record<string, T> {
  const circuitLines = circuit.bristol.split('\n');
  const [, wireCount] = circuitLines[0].split(' ').map(Number);

  if (!Number.isFinite(wireCount) || wireCount > 5e7) {
    throw new Error('Too many wires');
  }

  const wires = new Array<T>(wireCount).fill(arithmetic.init(0));

  for (const { value, address } of circuit.info.constants) {
    wires[address] = arithmetic.init(value);
  }

  if (Object.keys(inputs).length !== circuit.info.inputs.length) {
    throw new Error('Mismatch between input len and required input len');
  }

  for (const [name, value] of Object.entries(inputs)) {
    const inputInfo = circuit.info.inputs.find(i => i.name === name);
    const address = inputInfo?.address;

    if (address === undefined) {
      throw new Error(`Couldn't map input ${name} to a wire`);
    }

    wires[address] = arithmetic.init(value);
  }

  let i = 1;

  // scan until empty line
  while (i < circuitLines.length && circuitLines[i].trim() !== '') {
    i++;
  }

  // ignore empty lines
  while (i < circuitLines.length && circuitLines[i].trim() === '') {
    i++;
  }

  while (true) {
    const line = (circuitLines[i++] ?? '').trim();

    if (line === '') {
      break;
    }

    const parts = line.split(' ');
    const [inputLen, outputLen] = parts.slice(0, 2).map(Number);

    const inputs = parts.slice(2, 2 + inputLen).map(i => wires[Number(i)]);

    const outputIndexes = parts
      .slice(2 + inputLen, 2 + inputLen + outputLen)
      .map(Number);

    const op = parts[parts.length - 1];

    const outputs = arithmetic.combine(op, inputs);

    if (outputs.length !== outputLen) {
      throw new Error('Output len mismatch');
    }

    for (let j = 0; j < outputLen; j++) {
      wires[outputIndexes[j]] = outputs[j];
    }
  }

  const res: Record<string, T> = {};

  for (const { name, address } of circuit.info.outputs) {
    res[name] = wires[address];
  }

  return res;
}

type Arithmetic<T> = {
  init(source: unknown): T;
  combine(op: string, inputs: T[]): T[];
};

export const u32Arithmetic = {
  init(source) {
    if (
      typeof source === 'bigint' ||
      typeof source === 'number' ||
      typeof source === 'boolean' ||
      typeof source === 'string'
    ) {
      return BigInt(source) % 2n ** 32n;
    }

    throw new Error("Can't interpret source as u32");
  },

  // eslint-disable-next-line complexity
  combine(op, [a, b]) {
    switch (op) {
      case 'AUnaryAdd': {
        return [a];
      }

      case 'AUnarySub': {
        a = -a;

        if (a < 0n) {
          a += 2n ** 32n;
        }

        return [a];
      }

      case 'ANot': {
        return [a ? 0n : 1n];
      }

      case 'ABitNot': {
        return [~a + 2n ** 32n];
      }

      case 'AAdd': {
        return [(a + b) % 2n ** 32n];
      }

      case 'ASub': {
        let res = a - b;

        if (res < 0) {
          res += 2n ** 32n;
        }

        return [res];
      }

      case 'AMul': {
        return [(a * b) % 2n ** 32n];
      }

      case 'ADiv': {
        return [a / b];
      }

      case 'AMod': {
        return [a % b];
      }

      case 'AExp': {
        // Can be done more efficiently
        return [a ** b % 2n ** 32n];
      }

      case 'AEq': {
        return [a === b ? 1n : 0n];
      }

      case 'ANeq': {
        return [a === b ? 0n : 1n];
      }

      case 'ABoolAnd': {
        return [a && b ? 1n : 0n];
      }

      case 'ABoolOr': {
        return [a || b ? 1n : 0n];
      }

      case 'ALt': {
        return [a < b ? 1n : 0n];
      }

      case 'ALEq': {
        return [a <= b ? 1n : 0n];
      }

      case 'AGt': {
        return [a > b ? 1n : 0n];
      }

      case 'AGEq': {
        return [a >= b ? 1n : 0n];
      }

      case 'ABitAnd': {
        return [a & b];
      }

      case 'ABitOr': {
        return [a | b];
      }

      case 'AXor': {
        return [a ^ b];
      }

      case 'AShiftL': {
        return [(a << b) % 2n ** 32n];
      }

      case 'AShiftR': {
        return [a >> b];
      }

      default:
        throw new Error(`Unrecognized op ${op}`);
    }
  },
} satisfies Arithmetic<bigint>;
