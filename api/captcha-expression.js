module.exports = function captchaSolver(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Captcha OCR returned no readable text');
  }

  const numbers = [...text.matchAll(/\d+/g)].map(c => parseInt(c[0]));
  const operatorMatch = text.match(
    /(small|first|second|third|fourth|last|middle|great|large|\+|\*|\/|%|-)/i
  );
  if (!operatorMatch) {
    throw new Error(
      `Captcha operator could not be parsed from: ${text.trim()}`
    );
  }
  if (!numbers.length) {
    throw new Error(`Captcha numbers could not be parsed from: ${text.trim()}`);
  }

  const operator = operatorMatch[1].toLowerCase();
  const requireNumber = index => {
    if (!Number.isFinite(numbers[index])) {
      throw new Error(
        `Captcha does not contain the required number for ${operator}`
      );
    }
    return numbers[index];
  };

  console.log(numbers, operator);
  switch (operator) {
    case '+':
      return requireNumber(0) + requireNumber(1);

    case '-':
      return requireNumber(0) - requireNumber(1);

    case '*':
    case '%':
      return requireNumber(0) * requireNumber(1);

    case '/':
      if (requireNumber(1) === 0) {
        throw new Error('Captcha division by zero is invalid');
      }
      return parseInt(requireNumber(0) / requireNumber(1));

    case 'small':
      return Math.min(...numbers);

    case 'large':
      return Math.max(...numbers);

    case 'great':
      return Math.max(...numbers);

    case 'first':
      return requireNumber(0);

    case 'second':
      return requireNumber(1);

    case 'third':
      return requireNumber(2);

    case 'fourth':
      return requireNumber(3);

    case 'middle':
      return requireNumber(1);

    case 'last':
      return numbers[numbers.length - 1];

    default:
      throw new Error(`Unsupported captcha operator: ${operator}`);
  }
};

if (require.main == module) {
  console.log(module.exports(process.argv[2]));
}
