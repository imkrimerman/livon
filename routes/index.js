var cors = require('cors')
  , _ = require('lodash')
  , uuid = require('uuid')
  , url = require('url')
  , redis = require('redis')
  , path = require('path')
  , fs = require('fs')
  , os = require('os')
  , foodMap = require('../data/food')

  , botName = 'livon'
  , botStatus = '/' + botName + ' status'
  , botClear = '/' + botName + ' clear'
  , botMenu = '/' + botName + ' menu'
  , botCancel = '/' + botName + ' cancel'
  , botRandom = '/' + botName + ' random'
  , botRand = '/' + botName + ' rand'
  , botRestaurants = '/' + botName + ' restaurants'
  , botNewRestaurant = '/' + botName + ' new'
  , botRemoveRestaurant = '/' + botName + ' remove'

  , admins = ['Igor Krimerman', 'Yuri Servatko', 'Andrew Fadeev', 'Sergey Pustovit']
  , clientDbKey = botName + ' order'
  , clientDbExpire = 24 * 60 * 60;

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/guide
module.exports = function(app, addon) {
  var hipchat = require('../lib/hipchat')(addon);

  // This is an example route to handle an incoming webhook
  // https://developer.atlassian.com/hipchat/guide/webhooks
  app.post('/webhook', addon.authenticate(), function(req, res) {
    var params = req.body.item.message.message.trim().split(' ');
    var command = ('/' + botName + ' ' + (params[1] || '')).trim();
    switch (command) {
      case botStatus: return showStatus(req, res);
      case botClear: return clearOrders(req, res);
      case botMenu: return showMenu(req, res);
      case botCancel: return cancelOrder(req, res);
      case botRestaurants: return listRestaurants(req, res);
      case botNewRestaurant: return addNewRestaurant(req, res);
      case botRemoveRestaurant: return removeRestaurant(req, res);
      case botRandom:
      case botRand: return randomOrder(req, res);
      case '/' + botName: return sayHi(req, res);
      default: defaultAnswer(req, res);
    }
  });

  /**
   * Default answer
   * @param req
   * @param res
   */
  function randomOrder(req, res) {
    req.body.item.message.message = '/' + botName + ' bon ' + foodMap.random('bon');
    makeOrder(req, res);
  }

  /**
   * Orders random food
   * @param req
   * @param res
   */
  function defaultAnswer(req, res) {
    var menus = _.keys(foodMap.menus());
    console.log(menus);
    var orderMenu = req.body.item.message.message.replace('/' + botName, '').trim().split(' ');
    console.log(orderMenu);
    if (orderMenu.length && _.includes(menus, orderMenu[0])) {
      return makeOrder(req, res);
    }
    sendWtf(req, res);
  }

  function sendWtf(req, res) {
    var user = getUser(req);
    var img = addon.config.localBaseUrl() + '/img/kek.jpg';
    console.log(os.hostname());
    sendMessage(req, res, tag(user.name.split(' ')[0], 'em') + ' wtf?<br><br><img src="' + img + '" style="height:200px;">', {color: 'red'});
  }

  /**
   * Says hi
   * @param req
   * @param res
   */
  function sayHi(req, res) {
    var user = getUser(req);
    sendMessage(req, res, 'Hey ' + tag(user.name.split(' ')[0], 'em') + ', wanna eat?<br><br>' + prepareCommands());
  }

  /**
   * Returns list of commands
   * @returns {string}
   */
  function prepareCommands() {
    return [
      tag('/' + botName + ' {restaurant name} &nbsp; {food name/index}', 'strong') + ' - Make order',
      tag(botStatus + ' {restaurant name}', 'strong') + ' - Show orders',
      tag(botClear, 'strong') + ' - Clear all orders (admin only)',
      tag(botMenu + ' {restaurant name}', 'strong') + ' - Show menu',
      tag(botRestaurants, 'strong') + ' - Show restaurants',
      tag(botNewRestaurant + ' {restaurant json}', 'strong') + ' - Add new restaurant (admin only)',
      tag(botRemoveRestaurant + ' {restaurant name}', 'strong') + ' - Remove restaurant (admin only)',
      tag(botCancel, 'strong') + ' - Cancel order',
      tag(botRandom + ' {restaurant name}', 'strong') + ' - Let me decide for you'
    ].join('<br>');
  }

  /**
   * Shows current order list
   * @param req
   * @param res
   */
  function showStatus(req, res) {
    getAllOrders(function(orders) {
      var answer = '';

      if (_.isEmpty(orders)) {
        answer = 'No orders';
        return sendMessage(req, res, answer, { color: 'red' });
      }

      for (var user in orders) answer += formatAnswer(user, foodMap.getName.apply(foodMap, orders[user].split('.'))) + '<br>';
      sendMessage(req, res, makeSummary(orders) + answer, { color: 'green' });
    });
  }

  /**
   * Shows current restaurants list
   * @param req
   * @param res
   */
  function listRestaurants(req, res) {
    var restaurants = foodMap.restaurants()
      , list = [];

    for (var restaurant in restaurants) {
      var index = parseInt(restaurant) + 1;
      list.push(index + ' ' + tag(restaurants[restaurant], 'strong'));
    }

    sendMessage(req, res, list.join('<br>'));
  }

  /**
   * Adds new restaurant
   * @param req
   * @param res
   */
  function addNewRestaurant(req, res) {
    var user = getUser(req);

    if (isAdmin(user.name)) {
      var params = req.body.item.message.message.replace(botNewRestaurant, '').trim();

      var restaurantConfig = JSON.parse(params);
      var errors = validateNewRestaurant(restaurantConfig);

      if (errors.length) {
        return sendMessage(req, res, errors.join('<br>'));
      }

      var template = fs.readFileSync(path.join(__dirname, '..', 'data', 'template.tpl')).toString();

      template = template
        .replace('$NAME$', restaurantConfig.name)
        .replace('$LIST$', JSON.stringify(restaurantConfig.list))
        .replace('$TRANSLATE$', JSON.stringify(restaurantConfig.translate));

      fs.writeFileSync(path.join(__dirname, '..', 'data', 'menus', restaurantConfig.id + '.js'), template);
      return sendMessage(req, res, 'Restaurant ' + restaurantConfig.name + ' created successfully.');
    }

    return sendMessage(req, res, 'You are not allowed to create restaurants', { color: 'red' });
  }

  /**
   * Removes restaurant
   * @param req
   * @param res
   */
  function removeRestaurant(req, res) {
    var restaurantId = req.body.item.message.message.replace(botRemoveRestaurant, '').trim();
    var restaurants = foodMap.getRestaurants();

    if (_.includes(_.keys(restaurants), restaurantId)) {
      var user = getUser(req);

      if (isAdmin(user.name)) {
        fs.unlinkSync(path.join(__dirname, '..', 'data', 'menus', restaurantId + '.js'));
        return sendMessage(req, res, 'Restaurant "' + restaurantId + '" deleted successfully', { color: 'green' });
      }

      return sendMessage(req, res, 'You are not allowed to delete restaurants', { color: 'red' });
    }

    return sendMessage(req, res, 'There is no restaurants with id "' + restaurantId + '"', { color: 'red' });
  }

  function validateNewRestaurant(config) {
    var errors = [];

    var name = config.name;
    var id = config.id;
    var list = config.list;
    var translate = config.translate;
    var restaurants = foodMap.getRestaurants();
    var existingIds = _.keys(restaurants);
    var existingValues = _.values(restaurants);

    if (!name) {
      errors.push('You must specify name for a new restaurant');
    }

    if (!id) {
      errors.push('You must specify an id for a new restaurant');
    }

    if (_.includes(existingIds, id) || _.includes(existingValues, name)) {
      errors.push('Restaurant with id "' + id + '" and name "' + name + '" already exists');
    }

    if (!list) {
      errors.push('You must specify a list of food ids with prices for a new restaurant (list:{"kura": 45, ...})');
    }

    if (!translate) {
      errors.push('You must specify a translate of food ids for a new restaurant (translate:{"kura": "Kura assort", ...})');
    }

    if (translate && list) {

      var ids = _.keys(list);
      var idsTranslated = _.keys(translate);

      if (idsTranslated.length !== ids.length) {
        errors.push('You must specify a translate for all of food ids for a new restaurant');
      }

      var result = _.difference(ids, idsTranslated);

      if (result.length) {
        result.map(function (resultItem) {
          errors.push('For "' + resultItem + '" food translation is not specified');
        });
      }

    }

    return  errors;
  }

  /**
   * Makes orders summary
   * @param {object} orders
   * @returns {string}
   */
  function makeSummary(orders) {
    var total = {}
      , formatted = [];

    console.log(orders);

    _.each(_.values(orders), function(one) {
      var parameters = one.split('.');
      var restaurant = parameters[0], item = parameters[1];

      if (! _.has(total, one)) _.set(total, one, 0);
      var value = _.get(total, one);
      _.set(total, one, ++value);
    });

    for (var restaurant in total) {
      var totalSum = 0;

      formatted.push( tag(restaurant, 'strong') );

      for (var name in total[restaurant]) {
        var price = total[restaurant][name] * foodMap.getPrice(restaurant, name);
        totalSum += price;
        formatted.push(
          tag(foodMap.getName(restaurant, name), 'strong') + ': x' + total[restaurant][name] + ' (' + price + ' UAH)'
        );
      }

      formatted.push('<br>Total: ' + tag(totalSum, 'strong') + ' UAH<br><br>');
    }

    return formatted.join('<br>');
  }

  /**
   * Shows menu in the room
   * @param req
   * @param res
   */
  function showMenu(req, res) {
   var parameters = req.body.item.message.message.replace('/' + botName, '').trim().split(' ')
      , command = parameters[0]
      , restaurant = parameters[1];
    var foodMenu = foodMap.menu(restaurant)
      , menu = [];

    for (var name in foodMenu)
      menu.push(tag(name, 'em') + ': ' + tag(foodMenu[name], 'strong') + ' UAH');

    sendMessage(req, res, menu.join('<br>'));
  }

  /**
   * Clears order list
   * @param req
   * @param res
   */
  function clearOrders(req, res) {
    redisCall(function(client) {
      var user = getUser(req);
      if (isAdmin(user.name)) {
        client.del(clientDbKey);
        client.quit();
        return sendMessage(req, res, 'Orders cleared', { color: 'green' });
      }

      sendMessage(req, res, 'You are not allowed to clear orders', { color: 'red' });
    });
  }

  /**
   * Clears order list
   * @param userName
   */
  function isAdmin(userName) {
    return ~admins.indexOf(userName);
  }

  /**
   * Adds order to the list
   * @param req
   * @param res
   */
  function makeOrder(req, res) {
    var message = req.body.item.message
      , user = getUser(req)
      , parameters = message.message.replace('/' + botName, '').trim().split(' ')
      , restaurant = parameters[0].trim()
      , food = parameters[1].trim()
      , money = null;

    if (foodMap.has(restaurant, food)) money = foodMap.getPrice(restaurant, food);
    else {
      return sendWtf(req, res);
    }

    redisCall(function(client) {
      client.hset(clientDbKey, user.name, restaurant + '.' + foodMap.keyByTranslate( restaurant, food).trim(), redis.print);
      client.expire(clientDbKey, clientDbExpire);
      client.quit();
      sendMessage(req, res, formatAnswer(user.name, foodMap.getName(restaurant, food), money));
    });
  }

  /**
   * Cancels your order
   * @param req
   * @param res
   */
  function cancelOrder(req, res) {
    redisCall(function(client) {
      var user = getUser(req).name;
      client.hdel(clientDbKey, user);
      client.quit();
      sendMessage(req, res, tag(user, 'em') + ' cancelled order');
    });
  }

  /**
   * Returns all orders
   * @param {Function} cb
   */
  function getAllOrders(cb) {
    redisCall(function(client) {
      client.hgetall(clientDbKey, function(err, all) {
        cb(all);
        client.quit();
      });
    });
  }

  /**
   * Formats answer
   * @param {string} name
   * @param {string} food
   * @param [{string|number}] money
   * @returns {string}
   */
  function formatAnswer(name, food, money) {
    var answer = tag(name, 'em') + ' ordered ' + tag(food, 'strong');
    if (money != null) answer += ', prepare ' + tag(money, 'strong') + ' UAH';
    return answer;
  }

  /**
   * Sends message to the room
   * @param req
   * @param res
   * @param {string} answer
   * @param [{object}] opt
   * @param [{object}] card
   */
  function sendMessage(req, res, answer, opt, card) {
    opt = {options: opt};
    hipchat.sendMessage(req.clientInfo, req.context.item.room.id, answer, opt, card)
      .then(function(data) {
        res.sendStatus(200);
      });
  }

  /**
   * Opens redis connection, authenticates and invokes given `callback`
   * @param {Function} cb
   */
  function redisCall(cb) {
    var client = redis.createClient({
      host: process.env.REDISHOST,
      port: process.env.REDISPORT
    });
    client.auth(process.env.REDISPASS, function(err) {
      if (! err) cb(client);
      else console.log(err);
    });
  }

  /**
   * Returns string tag
   * @param {string|number} string
   * @param {string} tag
   * @returns {string}
   */
  function tag(string, tag) {
    return '<' + tag + '>' + string + '</' + tag + '>';
  }

  /**
   * Returns user
   * @param req
   * @returns {*}
   */
  function getUser(req) {
    return req.body.item.message.from;
  }

  // Root route. This route will serve the `addon.json` unless a homepage URL is
  // specified in `addon.json`.
  app.get('/', function(req, res) {
    // Use content-type negotiation to choose the best way to respond
    res.format({
      // If the request content-type is text-html, it will decide which to serve up
      'text/html': function() {
        var homepage = url.parse(addon.descriptor.links.homepage);
        if (homepage.hostname === req.hostname && homepage.path === req.path) {
          res.render('homepage', addon.descriptor);
        }
        else {
          res.redirect(addon.descriptor.links.homepage);
        }
      },
      // This logic is here to make sure that the `addon.json` is always
      // served up when requested by the host
      'application/json': function() {
        res.redirect('/atlassian-connect.json');
      }
    });
  });

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function(clientKey, clientInfo, req) {
    hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name +
                                                     ' add-on has been installed in this room');
  });

  // Clean up clients when uninstalled
  addon.on('uninstalled', function(id) {
    addon.settings.client.keys(id + ':*', function(err, rep) {
      rep.forEach(function(k) {
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });

};
