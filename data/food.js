'use strict';
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

/**
 * Food map
 * @type {object}
 */
module.exports = {

  menus: function() {
    var menus = {};

    var items = fs.readdirSync(path.join(__dirname, './menus'));
    for (var i = 0; i < items.length; i++) {
      var menuName = items[i].replace('.js', '');
      menus[menuName] = require(path.join(__dirname, 'menus', menuName));
    }
    return menus;
  },

  restaurants: function () {
    var list = [];
    var menus = this.menus();
    for (var restaurant in menus) {
      list.push(menus[restaurant].name + '   (' + restaurant + ')');
    }

    return list;
  },

  getRestaurants: function () {
    var list = [];
    var menus = this.menus();
    for (var restaurant in menus) {
      list[restaurant] = menus[restaurant].name;
    }

    return list;
  },

  menu: function (restaurant) {
    var menu = {}, i = 1, menus = this.menus();
    for (var name in menus[restaurant].list)
      menu[i++ + ') ' + this.getName(restaurant, name)] = this.getPrice(restaurant, name);
    return menu;
  },

  getPrice: function (restaurant, name) {
    name = this.cleanName(name);
    var menus = this.menus();
    if (this.isIndex(restaurant, name)) return menus[restaurant].list[this.getByIndex(restaurant, name)];
    if (this.isTranslate(restaurant, name)) return menus[restaurant].list[this.keyByTranslate(restaurant, name)];
    else if (menus[restaurant].list[name]) return menus[restaurant].list[name];
    return 0;
  },

  getName: function (restaurant, name) {
    var cleanName = this.cleanName(name);
    var menus = this.menus();
    if (this.isIndex(restaurant, name)) {
      var key = this.getByIndex(restaurant, name);
      return menus[restaurant].translate[key] + ' (' + key + ')';
    }
    else if (this.isTranslate(restaurant, name))
      return name + ' (' + this.keyByTranslate(restaurant, name) + ')';
    else if (menus[restaurant].list.hasOwnProperty(cleanName))
      return menus[restaurant].translate[cleanName] + ' (' + cleanName + ')';
    return name;
  },

  isTranslate: function (restaurant, name) {
    name = this.cleanName(name);
    var menus = this.menus();
    var translate = _.invert(menus[restaurant].translate);
    for (var key in translate) if (key.toLowerCase() === name) return true;
    return false;
  },

  keyByTranslate: function (restaurant, name) {
    var cleanName = this.cleanName(name);
    var menus = this.menus();
    var translate = _.invert(menus[restaurant].translate);
    for (var key in translate) if (key.toLowerCase() === cleanName) return translate[key];
    return name;
  },

  has: function (restaurant, name) {
    name = this.cleanName(name);

    if (this.isIndex(restaurant, name)) return true;

    var result = _.filter(this.getAll(restaurant), function (item) {
      return item.toLowerCase() === name;
    });

    return !_.isEmpty(result);
  },

  isIndex: function (restaurant, name) {
    name = +name;
    if (_.isNumber(name) && name <= this.count(restaurant) && name >= 0) return true;
    return false;
  },

  getByIndex: function (restaurant, index) {
    index = +index;

    var found = null, keys = this.getIndexed(restaurant);

    if (index <= 0) return _.first(keys);
    else if (index >= this.count(restaurant)) return _.last(keys);

    for (var key in this.list) {
      index--;
      if (index === 0) {
        found = key;
        break;
      }
    }

    return found;
  },

  random: function (restaurant) {
    function getRandom(min, max) {
      return ~~(Math.random() * (max - min) + min);
    }

    var index = getRandom(1, this.count(restaurant));

    return this.getByIndex(restaurant, index);
  },

  getAll: function (restaurant) {
    var menus = this.menus();
    return this.getIndexed(restaurant).concat(_.values(menus[restaurant].translate));
  },

  getIndexed: function (restaurant) {
    var menus = this.menus();
    return _.keys(menus[restaurant].list);
  },

  count: function (restaurant) {
    var menus = this.menus();
    return _.size(menus[restaurant].list);
  },

  cleanName: function (name) {
    return name.toLowerCase().trim();
  }
};
