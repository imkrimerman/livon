'use strict';
var _ = require('lodash');

/**
 * Food map
 * @type {object}
 */
module.exports = {
  list: {
    'kura': 45,
    'kura assort': 50,
    'kura shashlik': 50,

    'svin': 50,
    'svin assort': 56,
    'svin shashlik': 50,
  },
  translate: {
    'kura': 'Курица',
    'kura assort': "Курица ассорти",
    'kura shashlik': "Курица шашлык",

    'svin': "Свиная",
    'svin assort': "Свиная ассорти",
    'svin shashlik': "Свиной шашлык",
  },
  menu: function() {
    var menu = {}, i = 1;
    for (var name in this.list)
      menu[i++ + ') ' + this.getName(name)] = this.getPrice(name);
    return menu;
  },
  getPrice: function(name) {
    name = this.cleanName(name);
    if (this.isTranslate(name)) return this.list[this.keyByTranslate(name)];
    else if (this.list[name]) return this.list[name];
    return 0;
  },
  getName: function(name) {
    var cleanName = this.cleanName(name);
    if (this.isTranslate(name)) return name + ' (' + this.keyByTranslate(name) + ')';
    else if (this.list.hasOwnProperty(cleanName)) return this.translate[cleanName] + ' (' + cleanName + ')';
    return name;
  },
  isTranslate: function(name) {
    name = this.cleanName(name);
    var translate = _.invert(this.translate);
    for (var key in translate) if (key.toLowerCase() === name) return true;
    return false;
  },
  keyByTranslate: function(name) {
    var cleanName = this.cleanName(name);
    var translate = _.invert(this.translate);
    for (var key in translate) if (key.toLowerCase() === cleanName) return translate[key];
    return name;
  },
  has: function(name) {
    name = this.cleanName(name);
    var result = _.filter(this.getAll(), function(item) {
      return item.toLowerCase() === name;
    });
    return ! _.isEmpty(result);
  },
  getAll: function() {
    return _.keys(this.list).concat(_.values(this.translate));
  },
  cleanName: function(name) {
    return name.toLowerCase().trim();
  },
};
