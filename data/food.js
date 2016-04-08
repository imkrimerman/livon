'use strict';
var _ = require('lodash');

/**
 * Food map
 * @type {object}
 */
module.exports = {
  list: {
    'kura': 35,
    'kura bulka': 45,
    'kura assort': 49,
    'kura shashlik': 45

    'svin': 45,
    'svin bulka': 50,
    'svin assort': 59,
    'svin shashlik': 55,

    'po karski': 45,
    'po karski bulka': 50
  },

  translate: {
    'kura': 'Курица',
    'kura bulka': "Курица в булке",
    'kura assort': "Курица ассорти",
    'kura shashlik': "Курица шашлык",

    'svin': "Свиная",
    'svin bulka': "Свиная в булке",
    'svin assort': "Свиная ассорти",
    'svin shashlik': "Свиной шашлык",

    'po karski': "По-карски",
    'po karski bulka': "По-карски в булке"
  },

  menu: function() {
    var menu = {}, i = 1;
    for (var name in this.list)
      menu[i ++ + ') ' + this.getName(name)] = this.getPrice(name);
    return menu;
  },

  getPrice: function(name) {
    name = this.cleanName(name);
    if (this.isIndex(name)) return this.list[this.getByIndex(name)];
    if (this.isTranslate(name)) return this.list[this.keyByTranslate(name)];
    else if (this.list[name]) return this.list[name];
    return 0;
  },

  getName: function(name) {
    var cleanName = this.cleanName(name);
    if (this.isIndex(name)) {
      var key = this.getByIndex(name);
      return this.translate[key] + ' (' + key + ')';
    }
    else if (this.isTranslate(name))
      return name + ' (' + this.keyByTranslate(name) + ')';
    else if (this.list.hasOwnProperty(cleanName))
      return this.translate[cleanName] + ' (' + cleanName + ')';
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

    if (this.isIndex(name)) return true;

    var result = _.filter(this.getAll(), function(item) {
      return item.toLowerCase() === name;
    });

    return ! _.isEmpty(result);
  },

  isIndex: function(name) {
    name = +name;
    if (_.isNumber(name) && name <= this.count() && name >= 0) return true;
    return false;
  },

  getByIndex: function(index) {
    index = +index;

    var found = null, keys = this.getIndexed();

    if (index <= 0) return _.first(keys);
    else if (index >= this.count()) return _.last(keys);

    for (var key in this.list) {
      index--;
      if (index === 0) {
        found = key;
        break;
      }
    }

    return found;
  },

  random: function() {
    function getRandom(min, max) {
      return ~~(Math.random() * (max - min) + min);
    }

    var index = getRandom(1, this.count());

    return this.getByIndex(index);
  },

  getAll: function() {
    return this.getIndexed().concat(_.values(this.translate));
  },

  getIndexed: function() {
    return _.keys(this.list);
  },

  count: function() {
    return _.size(this.list);
  },

  cleanName: function(name) {
    return name.toLowerCase().trim();
  },
};
