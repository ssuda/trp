module.exports = function captchaSolver(text) {
  const numbers = [...text.matchAll(/\d+/g)].map(c => parseInt(c[0]));
  const operator = text
    .match(
      /(small|first|second|third|fourth|last|middle|great|large|\-|\+|\*|\/|%)/i
    )[1]
    .toLowerCase();

  console.log(numbers, operator);
  switch (operator) {
    case '+':
      return numbers[0] + numbers[1];

    case '-':
      return numbers[0] - numbers[1];

    case '*':
    case '%':
      return numbers[0] * numbers[1];

    case '/':
      return parseInt(numbers[0] / numbers[1]);

    case 'small':
      return Math.min(...numbers);

    case 'large':
      return Math.max(...numbers);

    case 'great':
      return Math.max(...numbers);

    case 'first':
      return numbers[0];

    case 'second':
      return numbers[1];

    case 'third':
      return numbers[2];

    case 'fourth':
      return numbers[3];

    case 'middle':
      return numbers[1];

    case 'last':
      return numbers[numbers.length - 1];
  }
};

if (require.main == module) {
  console.log(module.exports(process.argv[2]));
}
