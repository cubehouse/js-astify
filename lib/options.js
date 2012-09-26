exports.codegen = function options(){
  return {
    comment: false,
    allowUnparenthesizedNew: true,
    format: {
      indent: {
        style: '  ',
        base: 0,
        adjustMultilineComment: false
      },
      json: false,
      renumber: true,
      hexadecimal: true,
      quotes: 'single',
      escapeless: true,
      compact: false,
      parentheses: true,
      semicolons: true,
      safeConcatenation: true
    }
  };
}

