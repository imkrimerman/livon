var cors = require('cors')
  , uuid = require('uuid')
  , url = require('url')
  , redis = require('redis')
  , foodMap = require('../data/food')

  , botName = 'livon'
  , botStatus = '/' + botName + ' status'
  , botClear = '/' + botName + ' clear'
  , botMenu = '/' + botName + ' menu'
  , botCancel = '/' + botName + ' cancel'

  , clientDbKey = botName + ' order'
  , clientDbExpire = 24 * 60 * 60;

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/guide
module.exports = function(app, addon) {
  var hipchat = require('../lib/hipchat')(addon);

  // This is an example route to handle an incoming webhook
  // https://developer.atlassian.com/hipchat/guide/webhooks
  app.post('/webhook', addon.authenticate(), function(req, res) {
    var message = req.body.item.message.message;
    switch (message) {
      case botStatus: return showStatus(req, res);
      case botClear: return clearOrders(req, res);
      case botMenu: return showMenu(req, res);
      case botCancel: return cancelOrder(req, res);
      default: makeOrder(req, res);
    }
  });

  /**
   * Shows current order list
   * @param req
   * @param res
   */
  function showStatus(req, res) {
    getAllOrders(function(orders) {
      var answer = '';
      for (var user in orders) answer += formatAnswer(user, orders[user]) + '<br>';
      if (! answer.trim()) answer = 'No orders';
      sendMessage(req, res, answer, { color: 'green' });
    });
  }

  /**
   * Shows menu in the room
   * @param req
   * @param res
   */
  function showMenu(req, res) {
    var menu = [];
    for (var name in foodMap)
      menu.push(tag(name, 'em') + ': ' + tag(foodMap[name], 'strong') + ' UAH');
    sendMessage(req, res, menu.join('<br>'));
  }

  /**
   * Clears order list
   * @param req
   * @param res
   */
  function clearOrders(req, res) {
    redisCall(function(client) {
      client.del(clientDbKey);
      client.quit();
      sendMessage(req, res, 'Orders cleared', { color: 'green' });
    });
  }

  /**
   * Adds order to the list
   * @param req
   * @param res
   */
  function makeOrder(req, res) {
    var message = req.body.item.message
      , user = getUser(req)
      , food = message.message.replace('/' + botName, '').trim()
      , money = null;

    if (foodMap[food] != null) money = foodMap[food];

    redisCall(function(client) {
      client.hset(clientDbKey, user.name, food, redis.print);
      client.expire(clientDbKey, clientDbExpire);
      client.quit();
      sendMessage(req, res, formatAnswer(user.name, food, money));
    });
  }

  /**
   * Cancels your order
   * @param req
   * @param res
   */
  function cancelOrder(req, res) {
    redisCall(function(client) {
      var user = getUser(req).name
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
   * @param {string} string
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
