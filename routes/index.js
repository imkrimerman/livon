var cors = require('cors')
    , _ = require('lodash')
    , uuid = require('uuid')
    , url = require('url')
    // , redis = require('redis')
    , path = require('path')
    , fs = require('fs')
    , os = require('os')
    // , foodMap = require('../data/food')
    , Promise = require('promise')
    , mysql = require('mysql')

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

    , admins = ['Igor Krimerman', 'Yuri Servatko', 'Andrew Fadeev', 'Sergey Pustovit', 'Mikhail Zakharov']
    , clientDbKey = botName + ' order'
    , clientDbExpire = 24 * 60 * 60;


var db = mysql.createConnection({
    host     : 'webfck.org',
    user     : 'livon',
    password : 'GBSFO4livon',
    database : 'livon'
});
db.connect();


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
        db.query("SELECT * from goods order by RAND() limit 1", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, "The response with DB is empty");
                return;
            }
            db.query("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + rows[0].id + "')", function (err) {
                if(err){
                    sendMessage(req, res, "Error database: " + err);
                    console.log(err);
                    return;
                }
                sendMessage(req, res, "Your order is " + rows[0].name + " : " + rows[0].price + "UAH")
            });
        });
    }

    function randomOrderRestaurant(req, res, restaurant) {
        var userData = getUser(req);
        db.query("SELECT id from restaurants WHERE slug='" +restaurant+"' OR name='"+restaurant+"' OR id='"+restaurant+"'", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendWtf(req, res);
                return;
            }
            db.query("SELECT * from goods WHERE id_restaurant='" + rows[0].id + "' order by RAND() limit 1", function (err, rows) {
                if(err){
                    sendMessage(req, res, "Error database: " + err);
                    console.log(err);
                    return;
                }
                if(!rows.length){
                    sendMessage(req, res, "The response with DB is empty");
                    return;
                }
                db.query("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + rows[0].id + "')", function (err) {
                    if(err){
                        sendMessage(req, res, "Error database: " + err);
                        console.log(err);
                        return;
                    }
                    sendMessage(req, res, "Your order is " + rows[0].name + " : " + rows[0].price + "UAH");
                });
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

        db.query("SELECT id from restaurants where slug='" + restaurantName + "' OR name='" + restaurantName + "' OR id='" + restaurantName + "'", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
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
        console.log("start statusAll");
        var list = [],
            sum = 0,
            count = 0;
        var sql = "select users.name as 'name', dayOrders.name as 'good_name', restaurants.name as 'restaurants_name', dayOrders.price as 'price', count(*) as number, count(*)*dayOrders.price as total  from ( " +
            "select orders.id_user, goods.name, goods.id_restaurant, goods.price from orders " +
            "join goods on goods.id = orders.id_goods " +
            "and orders.done = 0 " +
            // "and orders.date > DATE('now', '-1 day') " +
            // "and orders.date < DATE('now', '+1 day')" +
            ") as dayOrders " +
            "join restaurants on restaurants.id = dayOrders.id_restaurant " +
            "join users on users.id = dayOrders.id_user " +
            "group by dayOrders.name, dayOrders.id_user " +
            "order by dayOrders.id_user";
        // console.log(sql);
        db.query(sql, function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, "There aren't orders in basket");
                return;
            }
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
                    sum += row.total;
                    count += row.number;
            }
            list.push("<tr>" +
                "<td></td>" +
                "<td></td>" +
                "<td>TOTAL COUNT:</td>" +
                "<td>" + count + "pcs" + "</td>" +
                "<td></td>" +
                "<td></td>" +
                "<td>TOTAL SUM:</td>" +
                "<td>" + sum + "UAH" + "</td>" +
                "</tr>");

            sendMessage(req, res, "<table>" + list.join('') + "</table>");
        });
    }

    function statusCount(req, res) {
        console.log("start statusCount");
        var list = [],
            sum = 0,
            count = 0,
            restauran = null,
            counter = 1;

        db.query("select dayOrders.name as 'good_name', restaurants.name as 'restaurants_name', dayOrders.price as price, count(*) as number, count(*) * dayOrders.price as total from (  " +
                    "select goods.name, goods.id_restaurant, goods.price from orders  " +
                    "join goods on goods.id = orders.id_goods " +
                        "and orders.done = 'FALSE'" +
                        // "and orders.date > DATE('now', '-1 day') " +
                        // "and orders.date < DATE('now', '+1 day')" +
                        ") as dayOrders " +
                "join restaurants on restaurants.id = dayOrders.id_restaurant " +
                    "group by restaurants.id, " +
                            "dayOrders.name " +
            "order by restaurants.id, count(*) desc", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, "There aren't orders in basket");
                return;
            }
            for (var row of rows) {

                if(restauran != row.restaurants_name){

                    if(restauran != null ){
                        list.push("<tr>"+
                            "<td>" + "</td>" +
                            "<td>" + "TOTAL COUNT: " + tag(count, 'b') + "</td>" +
                            "<td>" + "</td>" +
                            "<td>" + "TOTAL SUM: " + "</td>" +
                            "<td>" + tag(sum, 'b') + "</td>" +
                            "</tr>");
                    }

                    restauran = row.restaurants_name;

                    sum = 0;
                    count = 0;


                    counter = 1;
                    list.push("<tr><td><br></td></tr>");
                    list.push("<tr>"+
                        "<td>" + "</td>" +
                        "<td>" + row.restaurants_name + "</td>" +
                        "<td>" + "</td>" +
                        "<td>" + "</td>" +
                        "</tr>");
                }

                list.push("<tr>" +
                                "<td>" + tag(counter + ".", 'i') + "</td>" +
                                "<td>" + tag(row.good_name + " (" + row.price + ")", 'strong') + "</td>" +
                                "<td>" + " * " + "</td>" +
                                "<td>" + row.number + "pcs" + "</td>" +
                                "<td>" + row.total + "</td>" +
                            "</tr>");
                ++counter;
                sum += row.total;
                count += row.number;

            }

            list.push("<tr>"+
                "<td>" + "</td>" +
                "<td>" + "TOTAL COUNT: " + tag(count, 'b') + "</td>" +
                "<td>" + "</td>" +
                "<td>" + "TOTAL SUM: " + "</td>" +
                "<td>" + tag(sum, 'b') + "</td>" +
                "</tr>");
            sendMessage(req, res, "<table>" + list.join('') + "</table>");
        });
    }

    function statusMy(req, res){
        var list = [];
        db.query("select dayOrders.name as 'good_name', restaurants.name as 'restaurants_name', count(*) as number from ( " +
                    "select goods.name, goods.id_restaurant from orders " +
                    "join goods on goods.id = orders.id_goods " +
                        "and orders.id_user = '" + getUser(req).id + "'" +
                        "and orders.done = 'FALSE'" +
                        // "and orders.date > DATE('now', '-1 day') " +
                        // "and orders.date < DATE('now', '+1 day')" +
            ") as dayOrders " +
                "join restaurants on restaurants.id = dayOrders.id_restaurant " +
                    "group by restaurants.id, " +
                             "dayOrders.name;", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, "There aren't orders in basket");
                return;
            }

            for (var row of rows) {

                list.push("<tr>"+
                                "<td>" + row.restaurants_name + "</td>" +
                                "<td>" + tag(row.good_name, 'strong') + "</td>" +
                                "<td>" + "*" + "</td>" +
                                "<td>" + row.number + "pcs" + "</td>" +
                            "</tr>");
            }

            sendMessage(req, res, "<table>" + list.join('') + "</table>");
        });
    }

    function showTop(req, res){
        var list = [],
            index = 0;
        db.query("select users.name as name, count(*) as number from orders " +
                    "join users on users.id = orders.id_user " +
                        "and orders.done = 1 " +
                    "group by users.name " +
                    "ORDER BY number ASC  " +
                    "limit 10", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, "There aren't done orders in basket");
                return;
            }
            for (var row of rows) {
                index = index + 1;
                list.push("<tr>"+
                                "<td>" + index + "</td>" +
                                "<td>" + row.name + "</td>" +
                                "<td>" + tag(row.number, 'strong') + "</td>" +
                            "</tr>");
            }
            sendMessage(req, res, "<table>" + list.join('') + "</table>");
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
        db.query("SELECT * from restaurants", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, "There aren't restaurants in database");
                return;
            }
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
        db.query("SELECT * from restaurants where slug='" + config.name + "' OR name='" + config.name + "'", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if (rows.length) {
                sendMessage(req, res, 'This restaurant name is exist', {color: 'red'});
                return;
            }
            newRestaurant(req, res, config);
        });
    }

    function newRestaurant(req, res, config) {
        db.query("INSERT into restaurants(name, slug) VALUES ('" + config.name + "','" + config.slug + "')",function (err) {
            if(err){
                sendMessage(req, res, 'Error database: ' + err);
                return;
            }
            sendMessage(req, res, 'Restaurant ' + config.name + ' created successfully.');
        });
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
        db.query("SELECT * from goods where name='" + item.name + "' AND id_restaurant='" + idRestaurant + "'", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if (rows.length) {
                upgrateGoods(req, res, item, idRestaurant, rows[0].id);
            } else {
                newGoods(req, res, item, idRestaurant);
            }
        });
    }

    function newGoods(req, res, item, idRestaurant) {
        db.query("INSERT into goods(id_restaurant, name, slug, price) VALUES ('" + idRestaurant + "','" + item.name + "','" + item.slug + "','" + item.price + "')", function (err) {
            if(err){
                sendMessage(req, res, 'Error database: ' + err);
            } else {
                sendMessage(req, res, 'Goods ' + item.name + ' created successfully.');
            }
        });
    }

    function upgrateGoods(req, res, item, idRestaurant, idGoods) {
        db.query("UPDATE goods SET slug='" + item.slug + "', price='" + item.price + "' WHERE id='"+idGoods+"'", function (err) {
            if(err){
                sendMessage(req, res, 'Error database: ' + err);
            } else {
                sendMessage(req, res, 'Goods ' + item.name + ' upgrated successfully.');
            }
        });
    }

    function removeGoods(req, res, idRestaurant, list) {
        if(!isAdmin(getUser(req))) return sendMessage(req, res, "You aren't ADMIN!", {color: 'red'});
        if(!list) return sendWtf(req, res);
        var newlist = JSON.parse(list);
        if(!newlist.length) return sendWtf(req, res);

        for (var item of newlist) {
            db.query("DELETE from goods where id_restaurant='" + idRestaurant + "' AND ( id='" + item + "' OR name='" + item + "' OR slug='" + item + "')", function (err) {
               if(err){
                   sendWtf(req, res, "Error database: " + err);
               } else {
                   sendWtf(req, res, "The goods " + item + " is deleted");
               }
            });
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

        db.query("SELECT * from restaurants where name='" + restaurant + "' AND slug='" + restaurant + "' AND id_restaurant='" + restaurant + "'", function (err, rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length) return sendWtf(req, res);
            db.query("DELETE from restaurants where id='" + rows[0].id + "'");
            db.query("DELETE from goods where id_restaurant='" + rows[0].id + "'");
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
        db.query("UPDATE orders SET done=1 WHERE done=0", function (err) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            sendMessage(req, res, "All orders are transferred to status completed");
        });
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
        db.query("SELECT id from restaurants where name='" + restaurant + "' OR slug='" + restaurant + "' OR id='" + restaurant + "'", function(err,rows) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            if(!rows.length){
                sendMessage(req, res, 'Restaurant ' + restaurant + ' not found!');
                console.log(err);
                return;
            }
            idRestaurant = rows[0].id;
            //search goods of restaurant
            db.query("SELECT * from goods where id_restaurant=" + idRestaurant, function(err,rows) {
                if(err){
                    sendMessage(req, res, "Error database: " + err);
                    console.log(err);
                    return;
                }
                if (!rows.length) {
                    sendMessage(req, res, 'There aren\'t goods  in the ' + restaurant + '!');
                    return;
                }
                for (var item of rows){
                    menu.push(tag(item.id + ". ", 'em') + tag(item.name, 'strong') + " (" + tag(" " + item.slug, 'em') + ') : ' + tag(item.price, 'strong') + ' UAH');
                }
                sendMessage(req, res, menu.join('<br>'));
            });

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
        db.query("DELETE from orders where done='FALSE'", function (err) {
            if(err){
                sendMessage(req, res, "Error database: " + err);
                console.log(err);
                return;
            }
            sendMessage(req, res, 'You are not allowed to clear orders', {color: 'red'});
        });
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
                db.query("SELECT * from goods where id_restaurant='" + idRestaurant + "' AND (slug='" + food + "' OR name='" + food + "' OR id='" + food + "')", function(err,rows) {
                    // console.log("start query");
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
            db.query("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + goodsData.id + "')");
        })
        .catch(function (error) {
            console.log("error");
            console.log(error);
        });

    }

    function makeOrder(req, res) {
        var message = req.body.item.message
            , parameters = message.message.replace('/' + botName, '').trim().split(' ')
            , id = parameters[1]
            , userData =  getUser(req);

        var promise = new Promise(function (resolve, reject) {
                //find food
                db.query("SELECT * from goods where id='" + id + "'", function(err,rows) {
                    if( rows && rows.length ) {
                        var goodsData = rows[0];
                        resolve(goodsData);
                    } else {
                        sendWtf(req, res);
                        reject();
                    }
                });
        });

        promise
            .then(function (goodsData) {
                //verify user
                console.log("start find id user", goodsData);
                checkAndCreateUser(userData);
                return goodsData
            })
            .then(function (goodsData) {
                //make order
                console.log("create order", goodsData);
                sendMessage(req, res, tag(userData.name, "b") + " ordered " + tag(goodsData.name , 'b') + ", prepare " + tag(goodsData.price,"b") + " UAH" );
                db.query("INSERT into orders(id_user, id_goods) VALUES ('" + userData.id + "','" + goodsData.id + "')");
            })
            .catch(function (error) {
                console.log("error");
                console.log(error);
            });

    }
    
    function checkAndCreateUser(data) {
        db.query("SELECT * from users where name='" + data.name + "'", function (err, rows) {
            if (rows.length) {
                console.log("user is existing");
            } else {
                console.log("user is creating");
                console.log("INSERT into users(id, name) VALUES ('" + data.id + "','" + data.name + "')");
                db.query("INSERT into users(id, name) VALUES ('" + data.id + "','" + data.name + "')");
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
        db.query("DELETE from orders where id_user='"+userData.id+"' AND done='FALSE'");
        sendMessage(req, res, userData.name + ", your orders is empty");
    }

    /**
     * Returns all orders
     * @param {Function} cb
     */
    // function getAllOrders(cb) {
    //     redisCall(function (client) {
    //         client.hgetall(clientDbKey, function (err, all) {
    //             cb(all);
    //             client.quit();
    //         });
    //     });
    // }

    /**
     * Formats answer
     * @param {string} name
     * @param {string} food
     * @param [{string|number}] money
     * @returns {string}
     */
    // function formatAnswer(name, food, money) {
    //     var answer = tag(name, 'em') + ' ordered ' + tag(food, 'strong');
    //     if (money != null) answer += ', prepare ' + tag(money, 'strong') + ' UAH';
    //     return answer;
    // }

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




//    "start": "REDISPASS='' REDISHOST='127.0.0.1' REDISPORT='6379' node app.js",
