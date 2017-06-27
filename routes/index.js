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
    , botTop = '/' + botName + ' top'
    , botPerform = '/' + botName + ' perform'
    , botMake = '/' + botName + ' make'

    , admins = ['Igor Krimerman', 'Yuri Servatko', 'Andrew Fadeev', 'Sergey Pustovit', 'Michael Zakharov']
    , clientDbKey = botName + ' order'
    , clientDbExpire = 24 * 60 * 60;


// var Q = require('q');
var Promise = require('promise');
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./data/database.db');
//
// db.serialize(function() {

// db.run("CREATE TABLE restaraunts (" +
//   "id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
//   "name TEXT NOT NULL," +
//   "slug TEXT NOT NULL," +
//   "translate TEXT NULL)");
//
// db.run("CREATE TABLE goods (" +
//   "id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
//   "name TEXT NOT NULL," +
//   "slug TEXT NOT NULL," +
//   "translate TEXT NULL," +
//   "price INTEGER)");

// db.run("CREATE TABLE orders (" +
//   "id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
//   "id_user INTEGER," +
//   "id_goods INTEGER," +
//   "done INTEGER)");

// db.run("CREATE TABLE user  (" +
//   "id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT," +
//   "name TEXT NOT NULL)");


// });
//
// db.close();


// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/guide
module.exports = function (app, addon) {
    var hipchat = require('../lib/hipchat')(addon);

    // This is an example route to handle an incoming webhook
    // https://developer.atlassian.com/hipchat/guide/webhooks
    app.post('/webhook', addon.authenticate(), function (req, res) {
        var params = req.body.item.message.message.trim().split(' ');
        var command = ('/' + botName + ' ' + (params[1] || '')).trim();
        switch (command) {
            case botStatus:
                return showStatus(req, res);
            case botClear:
                return clearOrders(req, res);
            case botMenu:
                return showMenu(req, res);
            case botCancel:
                return cancelOrder(req, res);
            case botRestaurants:
                return listRestaurants(req, res);
            case botNewRestaurant:
                return addNewRestaurant(req, res);
            case botRemoveRestaurant:
                return removeRestaurant(req, res);
                case botTop:
                return showTop(req, res);
            case botPerform:
                return performOrders(req, res);
            case botMake:
                return makeOrder(req, res);
            case botRandom:
            case botRand:
                return randomOrder(req, res);
            case '/' + botName:
                return sayHi(req, res);
            default:
                defaultAnswer(req, res);
        }
    });

    /**
     * Orders random food
     * @param req
     * @param res
     */
    function randomOrder(req, res) {
        var commands = req.body.item.message.message.replace('/' + botName, '').trim().split(' ');
        var restaurant = commands[1];
        if(restaurant){
            randomOrderRestaurant(req, res, restaurant);
        } else {
            randomOrderALL(req, res);
        }
    }

    function randomOrderALL(req, res) {
        var userData = getUser(req);
        db.all("SELECT * from goods order by RANDOM() limit 1", function (err, rows) {
            db.run("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + rows[0].id + "')");
            sendMessage(req, res, "Your order is " + rows[0].name + " : " + rows[0].price + "UAH")
        });
    }

    function randomOrderRestaurant(req, res, restaurant) {
        var userData = getUser(req);
        db.all("SELECT id from restaurants WHERE slug='" +restaurant+"' OR name='"+restaurant+"' OR id='"+restaurant+"'", function (err, rows) {
            if(!rows[0].id) return sendWtf(req, res);
            db.all("SELECT * from goods WHERE id_restaurant='" + rows[0].id + "' order by RANDOM() limit 1", function (err, rows) {
                db.run("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + rows[0].id + "')");
                sendMessage(req, res, "Your order is " + rows[0].name + " : " + rows[0].price + "UAH")
            });
        });
    }

    /**
     * Default answer (make order and create goods)
     * @param req
     * @param res
     */
    function defaultAnswer(req, res) {
        var orderMenu = req.body.item.message.message.replace('/' + botName, '').trim().split(' ');
        // console.log(orderMenu);
        var restaurantName = orderMenu[0];

        db.all("SELECT id from restaurants where slug='" + restaurantName + "' OR name='" + restaurantName + "' OR id='" + restaurantName + "'", function (err, rows) {
            console.log("rows", rows);
            if (rows.length) {
                var list = req.body.item.message.message.replace('/' + botName + " " + orderMenu[0] + " " + orderMenu[1], '').trim();

                switch (orderMenu[1]) {
                    case "new":
                        return addNewGoods(req, res, rows[0].id, list);
                    case "remove":
                        return removeGoods(req, res, rows[0].id, list);
                    default:
                        order(req, res, rows[0].id);
                }
            } else {
                sendWtf(req, res);
            }
        });
    }

    function sendWtf(req, res) {
        var user = getUser(req);
        // var img = addon.config.localBaseUrl() + '/img/kek.jpg';
        // console.log(os.hostname());
        // sendMessage(req, res, tag(user.name.split(' ')[0], 'em') + ' wtf?<br><br><img src="' + img + '" style="height:200px;">', {color: 'red'});
        sendMessage(req, res, tag(user.name.split(' ')[0], 'em') + ' wtf?<br>', {color: 'red'});
    }

    /**
     * Says hi
     * @param req
     * @param res
     */
    function sayHi(req, res) {
        var user = getUser(req);
        sendMessage(req, res, 'Hey ' + tag(user.name.split(' ')[0], 'em') + ', wanna eat?<br><br>' + prepareCommands(req));
    }

    /**
     * Returns list of commands
     * @returns {string}
     */
    function prepareCommands(req) {
        var adminValue = [];
        var defaultValue = [
            tag('/' + botName + ' {restaurant name} &nbsp; {food name|slug|id}', 'strong') + ' - Make order',
            tag(botMake + ' {goods ID}', 'strong') + ' - make order by goods ID ',
            tag(botStatus, 'strong') + ' - Show all orders',
            tag(botStatus + ' count', 'strong') + ' - Show count orders',
            tag(botStatus + ' my', 'strong') + ' - Show my orders',
            tag(botMenu + ' {restaurant name|slug|id}', 'strong') + ' - Show menu',
            tag(botRestaurants, 'strong') + ' - Show restaurants',
            tag(botCancel, 'strong') + ' - Cancel my order',
            tag(botRandom, 'strong') + ' - Let me decide for you',
            tag(botRandom + ' {restaurant name}', 'strong') + ' - Let me decide for you in {restaurant name}',
            tag(botTop, 'strong') + ' - Top 10 orderer'
        ];

        if (isAdmin(getUser(req))) {
            adminValue = [
                tag(" - = only for admin = - ", 'strong'),
                tag(botClear, 'strong') + ' - Clear all orders',
                tag(botNewRestaurant + ' {restaurant json}', 'strong') + ' - Add new restaurant ({"name": "test","slug":"test"})',
                tag(botRemoveRestaurant + ' {restaurant name}', 'strong') + ' - Remove restaurant (name|slug|id)',
                tag('/' + botName + ' {restaurant} new {json}', 'strong') + ' - Add new goods ([{"name":"","slug":"","price":""}])',
                tag('/' + botName + ' {restaurant} remove {json}', 'strong') + ' - Remove goods (["name|slug|id"])',
                tag(botPerform, 'strong') + ' - Perform orders)'
            ];
        }

        return defaultValue.concat(adminValue).join('<br>');
    }

    /**
     * Shows current order list
     * @param req
     * @param res
     */
    function showStatus(req, res) {
        var orderMenu = req.body.item.message.message.replace('/' + botName, '').trim().split(' ');
        console.log("orderMenu", !orderMenu[1], orderMenu[1]);
        if(!orderMenu[1]){
            return statusAll(req, res);
        }
        switch (orderMenu[1]){
            case "my": return statusMy(req, res);
            case "count": return statusCount(req, res);
            default: return statusRestaurant(req, res);
        }
    }
    
    function statusAll(req, res) {
        var list = [];
        db.all("select users.name as 'name', dayOrders.name as 'good_name', restaurants.name as 'restaurants_name', dayOrders.price as 'price', count(*) as number, count(*)*dayOrders.price as total  from ( " +
                    "select orders.id_user, goods.name, goods.id_restaurant, goods.price from orders " +
                    "join goods on goods.id = orders.id_goods " +
                        "and orders.done = 'FALSE' " +
                        "and orders.date > DATE('now', '-1 day') " +
                        "and orders.date < DATE('now', '+1 day')) as dayOrders " +
                "join restaurants on restaurants.id = dayOrders.id_restaurant " +
                "join users on users.id = dayOrders.id_user " +
                    "group by dayOrders.name", function (err, rows) {
            // console.log(rows);
            for (var row of rows) {
                list.push("<tr>" +
                            "<td>" + tag(row.name, 'strong') + "</td>" +
                            "<td>" + row.restaurants_name + "</td>" +
                            "<td>" + tag(row.good_name, 'strong') + "</td>" +
                            "<td>" + row.price + "</td>" +
                            "<td>" + "*" + "</td>" +
                            "<td>" + row.number + "pcs" + "</td>" +
                            "<td>" + "=" + "</td>" +
                            "<td>" + row.total + "UAH" + "</td>" +
                        "</tr>");
            }
            if(rows.length){
                sendMessage(req, res, "<table>" + list.join('') + "</table>");
            } else {
                sendMessage(req, res, "All orders are empty");
            }
        });
    }

    function statusCount(req, res) {
        console.log("start statusCount");
        var list = [];
        db.all("select dayOrders.name as 'good_name', restaurants.name as 'restaurants_name', count(*) as number from ( " +
                    "select goods.name, goods.id_restaurant from orders " +
                    "join goods on goods.id = orders.id_goods " +
                        "and orders.done = 'FALSE'" +
                        "and orders.date > DATE('now', '-1 day') " +
                        "and orders.date < DATE('now', '+1 day')) as dayOrders " +
                "join restaurants on restaurants.id = dayOrders.id_restaurant " +
                    "group by restaurants.id, " +
                            "dayOrders.name;", function (err, rows) {
            for (var row of rows) {
                list.push("<tr>" +
                                "<td>" + row.restaurants_name + "</td>" +
                                "<td>" + tag(row.good_name, 'strong') + "</td>" +
                                "<td>" + " * " + "</td>" +
                                "<td>" + row.number + "pcs" + "</td>" +
                            "</tr>");
            }
            if(rows.length){
                sendMessage(req, res, "<table>" + list.join('') + "</table>");
            } else {
                sendMessage(req, res, "All orders are empty");
            }
        });
    }

    function statusMy(req, res){
        var list = [];
        db.all("select dayOrders.name as 'good_name', restaurants.name as 'restaurants_name', count(*) as number from ( " +
                    "select goods.name, goods.id_restaurant from orders " +
                    "join goods on goods.id = orders.id_goods " +
                        "and orders.id_user = '" + getUser(req).id + "'" +
                        "and orders.done = 'FALSE'" +
                        "and orders.date > DATE('now', '-1 day') " +
                        "and orders.date < DATE('now', '+1 day')) as dayOrders " +
                "join restaurants on restaurants.id = dayOrders.id_restaurant " +
                    "group by restaurants.id, " +
                             "dayOrders.name;", function (err, rows) {
            for (var row of rows) {
                list.push("<tr>"+
                                "<td>" + row.restaurants_name + "</td>" +
                                "<td>" + tag(row.good_name, 'strong') + "</td>" +
                                "<td>" + "*" + "</td>" +
                                "<td>" + row.number + "pcs" + "</td>" +
                            "</tr>");
            }
            if(rows.length){
                sendMessage(req, res, "<table>" + list.join('') + "</table>");
            } else {
                sendMessage(req, res, getUser(req).name + ", your orders are empty");
            }

        });
    }

    function showTop(req, res){
        var list = [],
            index = 0;
        db.all("select users.name as name, count(*) as number from orders " +
                    "join users on users.id = orders.id_user " +
                        "and orders.done = 'TRUE' " +
                    "group by users.name " +
                    "ORDER BY number ASC  " +
                    "limit 10", function (err, rows) {
            for (var row of rows) {
                index = index + 1;
                list.push("<tr>"+
                                "<td>" + index + "</td>" +
                                "<td>" + row.name + "</td>" +
                                "<td>" + tag(row.number, 'strong') + "</td>" +
                            "</tr>");
            }
            if(rows.length){
                sendMessage(req, res, "<table>" + list.join('') + "</table>");
            } else {
                sendMessage(req, res, "List is empty");
            }

        });
    }
    
    function statusRestaurant(req, res) {
        sendWtf(req,res);
    }


    /**
     * Shows current restaurants list
     * @param req
     * @param res
     */
    function listRestaurants(req, res) {
        var list = [];
        db.all("SELECT * from restaurants", function (err, rows) {
            for (var row of rows) {
                list.push("<tr>" +
                                "<td>" + row.id + "</td>" +
                                "<td>" + tag(row.name, 'strong') + "</td>" +
                                "<td>" + row.slug + "</td>" +
                            "<tr/>");
            }
            sendMessage(req, res, "<table>" + list.join('') + "</table>");
        });
    }

    /**
     * Adds new restaurant
     * @param req
     * @param res
     */
    function addNewRestaurant(req, res) {
        if (!isAdmin(getUser(req))) {
            return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        }
        var params = req.body.item.message.message.replace(botNewRestaurant, '').trim();
        var restaurantConfig = JSON.parse(params);
        var errors = validateNewRestaurant(restaurantConfig);
        if (errors.length) {
            return sendMessage(req, res, errors.join('<br>'));
        }
        verifyRestaurantIsExist(req, res, restaurantConfig);
    }

    function verifyRestaurantIsExist(req, res, config) {
        db.all("SELECT * from restaurants where slug='" + config.name + "' OR name='" + config.name + "'", function (err, rows) {
            if (rows.length) {
                sendMessage(req, res, 'You are not allowed to create restaurants', {color: 'red'});
            } else {
                newRestaurant(config);
                sendMessage(req, res, 'Restaurant ' + config.name + ' created successfully.');
            }
        });
    }

    function newRestaurant(config) {
        db.run("INSERT into restaurants(name, slug) VALUES ('" + config.name + "','" + config.slug + "')");
    }

    function addNewGoods(req, res, idRestaurant, list) {
        if(!isAdmin(getUser(req))) return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        if(!list) return sendWtf(req, res);
        var newlist = JSON.parse(list);
        if(!newlist.length) return sendWtf(req, res);

        for (var item of newlist) {
            var errors = validateNewGoods(item);
            if (errors.length) {
                errors.push(item);
                sendMessage(req, res, errors.join('<br>'));
                continue;
            }
            verifyGoodsIsExist(req, res, item, idRestaurant);
        }
    }

    function verifyGoodsIsExist(req, res, item, idRestaurant) {
        db.all("SELECT * from goods where name='" + item.name + "' AND id_restaurant='" + idRestaurant + "'", function (err, rows) {
            if (rows.length) {
                upgrateGoods(item, idRestaurant, rows[0].id);
                sendMessage(req, res, 'Goods ' + item.name + ' upgrated successfully.');
            } else {
                newGoods(item, idRestaurant);
                sendMessage(req, res, 'Goods ' + item.name + ' created successfully.');
            }
        });
    }

    function newGoods(item, idRestaurant) {
        db.run("INSERT into goods(id_restaurant, name, slug, price) VALUES ('" + idRestaurant + "','" + item.name + "','" + item.slug + "','" + item.price + "')");
    }

    function upgrateGoods(item, idRestaurant, idGoods) {
        db.run("UPDATE goods SET slug='" + item.slug + "', price='" + item.price + "' WHERE id='"+idGoods+"'");
    }

    function removeGoods(req, res, idRestaurant, list) {
        if(!isAdmin(getUser(req))) return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        if(!list) return sendWtf(req, res);
        var newlist = JSON.parse(list);
        if(!newlist.length) return sendWtf(req, res);

        for (var item of newlist) {
            db.run("DELETE from goods where id_restaurant='" + idRestaurant + "' AND ( id='" + item + "' OR name='" + item + "' OR slug='" + item + "')");
            sendWtf(req, res, "The goods " + item + " is deleted");
        }
    }

    function verifyIsNumb(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    /**
     * Removes restaurant
     * @param req
     * @param res
     */
    function removeRestaurant(req, res) {
        if (!isAdmin(getUser(req))) {
            return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        }

        var restaurant = req.body.item.message.message.replace(botRemoveRestaurant, '').trim(),
            restaurantName;

        db.all("SELECT * from restaurants where name='" + restaurant + "' AND slug='" + restaurant + "' AND id_restaurant='" + restaurant + "'", function (err, rows) {
            if(!rows.length) return sendWtf(req, res);
            db.run("DELETE from restaurants where id='" + rows[0].id + "'");
            db.run("DELETE from goods where id_restaurant='" + rows[0].id + "'");
            restaurantName = rows[0].name;
        });

        return sendMessage(req, res, 'Restaurant "' + restaurantName + '" deleted successfully', {color: 'green'});
    }

    function validateNewRestaurant(config) {
        var errors = [];

        if (!config.name) {
            errors.push('You must specify name for a new restaurant');
        }

        if (!config.slug) {
            errors.push('You must specify slug for a new restaurant');
        }

        return errors;
    }

    function validateNewGoods(config) {
        var errors = [];

        if (!config.name) {
            errors.push('You must specify name for a new restaurant');
        }

        if (!config.slug) {
            errors.push('You must specify slug for a new restaurant');
        }

        if (!config.price) {
            errors.push('You must specify price for a new restaurant');
        }

        return errors;
    }

    /**
     * Perform orders
     * @param req
     * @param res
     */


    function performOrders(req, res) {
        if(!isAdmin(getUser(req))) return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        db.run("UPDATE orders SET done='TRUE' WHERE done='FALSE'");
        sendMessage(req, res, "All orders are transferred to status completed");
    }

    /**
     * Shows menu in the room
     * @param req
     * @param res
     */
    function showMenu(req, res) {
        console.log("start showMenu");
        var parameters = req.body.item.message.message.replace('/' + botName, '').trim().split(' ')
            , command = parameters[0]
            , restaurant = parameters[1]
            , menu = []
            , idRestaurant;
        console.log(restaurant);
        if(!restaurant) return sendWtf(req, res);

        // search id restaurant
        db.all("SELECT id from restaurants where name='" + restaurant + "' OR slug='" + restaurant + "' OR id='" + restaurant + "'", function(err,rows) {
            console.log("restaurants", rows);
            if (rows.length){
                idRestaurant = rows[0].id;

                //search goods of restaurant
                db.all("SELECT * from goods where id_restaurant=" + idRestaurant, function(err,rows) {
                    console.log("goods", rows);
                    if (rows.length){
                        for (var item of rows)
                            menu.push(tag(item.id + ". ", 'em') + tag(item.name, 'strong') + " (" + tag(" " + item.slug, 'em') + ') : ' + tag(item.price, 'strong') + ' UAH');
                        sendMessage(req, res, menu.join('<br>'));
                    } else {
                        sendMessage(req, res, 'There aren\'t goods  in the ' + restaurant + '!');
                    }
                });

            } else {
                return sendMessage(req, res, 'Restaurant ' + restaurant + ' not found!');
            }
        });

    }

    /**
     * Clears order list
     * @param req
     * @param res
     */
    function clearOrders(req, res) {
        if (!isAdmin(getUser(req))) {
            return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        }
        db.run("DELETE from orders where done='FALSE'");
        sendMessage(req, res, 'You are not allowed to clear orders', {color: 'red'});
    }

    /**
     * Clears order list
     * @param userName
     */
    function isAdmin(userName) {
        return ~admins.indexOf(userName.name);
    }

    /**
     * Adds order to the list
     * @param req
     * @param res
     */
    function order(req, res, idRestaurant) {
        var message = req.body.item.message
            , user = getUser(req)
            , parameters = message.message.replace('/' + botName, '').trim().split(' ')
            , restaurant = parameters[0].trim()
            , food = parameters[1]
            , userData =  getUser(req);

        var promise = new Promise(function (resolve, reject) {
                //find food
                db.all("SELECT * from goods where id_restaurant='" + idRestaurant + "' AND (slug='" + food + "' OR name='" + food + "' OR id='" + food + "')", function(err,rows) {
                    console.log("start query");
                    if( rows.length ) {
                        var goodsData = rows[0];
                        resolve(goodsData);
                    } else {
                        sendWtf(req, res);
                        reject();
                    }
                });
        });

        promise.then(function (goodsData) {
            //verify user
            console.log("start find id user", goodsData);
            checkAndCreateUser(userData);
            return goodsData
        })
        .then(function (goodsData) {
            //make order
            console.log("create order", goodsData);
            sendMessage(req, res, tag(userData.name, "b") + " ordered " + tag(goodsData.name , 'b') + ", prepare " + tag(goodsData.price,"b") + " UAH" );
            db.run("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + goodsData.id + "')");
        })
        .catch(function (error) {
            console.log("error");
            console.log(error);
        });

    }

    function makeOrder(req, res) {
        var message = req.body.item.message
            , user = getUser(req)
            , parameters = message.message.replace('/' + botName, '').trim().split(' ')
            , restaurant = parameters[0].trim()
            , id = parameters[1]
            , userData =  getUser(req);

        var promise = new Promise(function (resolve, reject) {
                //find food
                db.all("SELECT * from goods where  id='" + id + "')", function(err,rows) {
                    console.log("start query");
                    if( rows.length ) {
                        var goodsData = rows[0];
                        resolve(goodsData);
                    } else {
                        sendWtf(req, res);
                        reject();
                    }
                });
        });

        promise.then(function (goodsData) {
            //make order
            console.log("create order", goodsData);
            sendMessage(req, res, tag(userData.name, "b") + " ordered " + tag(goodsData.name , 'b') + ", prepare " + tag(goodsData.price,"b") + " UAH" );
            db.run("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + goodsData.id + "')");
        })
        .catch(function (error) {
            console.log("error");
            console.log(error);
        });

    }
    
    function checkAndCreateUser(data) {
        db.all("SELECT * from users where name='" + data.name + "'", function (err, rows) {
            if (rows.length) {
                console.log("user is existing");
            } else {
                console.log("user is creating");
                console.log("INSERT into users(id, name) VALUES ('" + data.id + "','" + data.name + "')");
                db.run("INSERT into users(id, name) VALUES ('" + data.id + "','" + data.name + "')");
            }
        });
    }

    /**
     * Cancels your order
     * @param req
     * @param res
     */
    function cancelOrder(req, res) {
        var userData = getUser(req);
        db.run("DELETE from orders where id_user='"+userData.id+"' AND done='FALSE'");
        sendMessage(req, res, userData.name + ", your orders is empty");
    }

    /**
     * Returns all orders
     * @param {Function} cb
     */
    function getAllOrders(cb) {
        redisCall(function (client) {
            client.hgetall(clientDbKey, function (err, all) {
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
            .then(function (data) {
                res.sendStatus(200);
            });
    }

    /**
     * Opens redis connection, authenticates and invokes given `callback`
     * @param {Function} cb
     */
    // function redisCall(cb) {
    //     var client = redis.createClient({
    //         host: process.env.REDISHOST,
    //         port: process.env.REDISPORT
    //     });
    //     client.auth(process.env.REDISPASS, function (err) {
    //         if (!err) cb(client);
    //         else console.log(err);
    //     });
    // }

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
    app.get('/', function (req, res) {
        // Use content-type negotiation to choose the best way to respond
        res.format({
            // If the request content-type is text-html, it will decide which to serve up
            'text/html': function () {
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
            'application/json': function () {
                res.redirect('/atlassian-connect.json');
            }
        });
    });

    // Notify the room that the add-on was installed. To learn more about
    // Connect's install flow, check out:
    // https://developer.atlassian.com/hipchat/guide/installation-flow
    addon.on('installed', function (clientKey, clientInfo, req) {
        hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name +
            ' add-on has been installed in this room');
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

