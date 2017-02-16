// dependencies
var pcss = require('postcss');

// ignore keyframe selectors
var ignoredSelectors = ['to', 'from'];

function getAllVariables(css) {
  var vars = [];
  var varIdentification = 'var(';

  css.walkRules(':root', rule => {
    rule.walkDecls(decl => {
      if (decl.parent.selector != ':root') {
        return;
      }

      var name = decl.prop.trim();
      var value = decl.value.trim();
      var fallbackVariable;

      let indexOfVar;
      while((indexOfVar = value.indexOf(varIdentification)) >= 0) {
        const indexOfComma = value.indexOf(',', indexOfVar);
        const indexOfBracket = findIndexOfClosingBracket(value, indexOfVar + varIdentification.length);
        const varName = value.substring(indexOfVar + varIdentification.length, indexOfComma === -1 ? indexOfBracket : Math.min(indexOfComma, indexOfBracket)).trim();
        const fallback = indexOfComma === -1 ? undefined : value.substring(indexOfComma + 1, indexOfBracket).trim();
        let variable = vars.find(item => item.name == varName);
        let valueToPaste;
        if (!variable) {
          if (fallback) {
              valueToPaste = fallback;
          } else {
            return;
          }
        } else {
            valueToPaste = variable.value;
            fallbackVariable = variable.name;
        }

        value = value.substring(0, indexOfVar) + valueToPaste + value.substring(indexOfBracket + 1);
      }

      if(value != decl.value.trim()) {

      }

      if (!vars.find(item => item.name == name)) {
        vars.push({name, value, fallback: fallbackVariable});
      }
    })
  });

  return vars;
}


function findIndexOfClosingBracket(variable, start) {
    let numberOfBrackets = 1;
    let closingIndex = start;
    while(numberOfBrackets > 0) {
        switch (variable[closingIndex]) {
            case '(':
                numberOfBrackets++;
                break;
            case ')':
                numberOfBrackets--;
                break;
            default:
                break;
        }
        closingIndex++;
    }

    return closingIndex - 1;
}

// plugin
module.exports = pcss.plugin('reportal-postcss-extract-custom-properties', function (options) {

  function plugin(css, result) {
    var extractedProperties = {};
    var vars = getAllVariables(css);

    // resolve custom properties (css variables)
    css.walkDecls(function (decl) {

      var value = decl.value;
      if (decl.important) {
          value += ' !important';
      }
      const associatedVars = vars.filter(variable => value.indexOf(variable.name) >= 0);

      // Skip values that don’t contain css var functions or can't be resolved
      if (!value || value.indexOf('var(') === -1 || associatedVars.length == 0) {
        return;
      }

      // CSS selector name (.class1, #container2, etc.)
      var selectorName = decl.parent.selector;
      if (selectorName.indexOf(':root') >= 0) {
        return;
      }

      // CSS property name (border-color, font-size, etc.)
      var propertyName = decl.prop;

      // Skip keyframes
      if (ignoredSelectors.indexOf(selectorName) > -1 ||
        selectorName.indexOf('%') > -1) {
        result.warn('Ignored variable in keyframe', {
          node: decl,
          word: value
        });
        return;
      }

      // varName exists in object
      let item;
      if (decl.parent.parent.type == 'atrule') {
        item = {
          selectorName,
          atrules: ['@' + decl.parent.parent.name + ' ' + decl.parent.parent.params]
        }
      } else {
        item = {selectorName}
      }


      if (extractedProperties[value]) {
        // Create array if it does not exist
        if (!extractedProperties[value][propertyName]) {
          extractedProperties[value][propertyName] = [];
        }

        const index = extractedProperties[value][propertyName].findIndex(item => item.selectorName == selectorName);
        // Avoid duplicating vars
        if (index === -1) {
          extractedProperties[value][propertyName].push(item);
        } else {
          const atrules = extractedProperties[value][propertyName][index].atrules;
          if (atrules) {
            atrules.push(...item.atrules.filter(atrule => atrules.indexOf(atrule) === -1));
          }
        }

        // Create new property
      } else {
        extractedProperties[value] = {
          [propertyName]: [item],
          associatedVars
        };
      }
    });

    result.contents = {vars, extractedProperties};
  }

  return plugin;
});
