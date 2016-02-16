var http = require('request');
var cors = require('cors');
var uuid = require('uuid');
var url = require('url');
var redis = require('redis');

var botName = 'livon';
var botStatus = '/' + botName + ' status';
var clientDbKey = botName + ' order';

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/guide
module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);

  // This is an example route to handle an incoming webhook
  // https://developer.atlassian.com/hipchat/guide/webhooks
  app.post('/webhook', addon.authenticate(), function (req, res) {
    var message = req.body.item.message.message;
    if (message === botStatus) showStatus(req);
    else makeOrder(req);
  });

  function makeOrder(req) {
    var message = req.body.item.message
      , user = message.from
      , food = message.message.replace('/' + botName, '');

    var client = redis.createClient();
    client.hset(clientDbKey, user.name, food, redis.print);
    client.expire(clientDbKey, 24 * 60 * 60);
    client.quit();
    sendMessage(req, formatAnswer(user.name, food));
  }

  function showStatus(req) {
    return getAllOrders(function(orders) {
      var answer = '';
      for (var user in orders) answer += formatAnswer(user, orders[user]) + '<br>';
      sendMessage(req, answer, {color: 'green'});
    })
  }

  function getAllOrders (cb) {
    var client = redis.createClient();
    client.hgetall(clientDbKey, function (err, all) {
      cb(all);
      client.quit();
    });
  }

  function formatAnswer(name, food) {
    return '<strong>' name + '</strong> ordered <em>' + food + '</em>';
  }

  function sendMessage(req, answer, opt) {
    hipchat.sendMessage(req.clientInfo, req.context.item.room.id, answer, opt)
      .then(function (data) {
        res.sendStatus(200);
      });
  }


  // Root route. This route will serve the `addon.json` unless a homepage URL is
  // specified in `addon.json`.
  app.get('/', function (req, res) {
    // Use content-type negotiation to choose the best way to respond
    res.format({
      // If the request content-type is text-html, it will decide which to serve up
      'text/html': function () {
        var homepage = url.parse(addon.descriptor.links.homepage);
        if (homepage.hostname === req.hostname && homepage.path === req.path) {
          res.render('homepage', addon.descriptor);
        } else {
          res.redirect(addon.descriptor.links.homepage);
        }
      },
      // This logic is here to make sure that the `addon.json` is always
      // served up when requested by the host
      'application/json': function () {
        res.redirect('/atlassian-connect.json');
      }
    });
  });

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function (clientKey, clientInfo, req) {
    hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name + ' add-on has been installed in this room');
  });

  // Clean up clients when uninstalled
  addon.on('uninstalled', function (id) {
    addon.settings.client.keys(id + ':*', function (err, rep) {
      rep.forEach(function (k) {
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });

};
