const express = require('express');
const handlebars = require('express-handlebars');
const bodyParser = require('body-parser');
const path = require('path');
const URL = require('url');
const request = require('request')
const TF2Items = require('tf2-items');
const config = require('./config.js');

if (!config.steamKey || !config.priceKey) { //ends process if credentials are not supplied 
    console.log("fill out the config to begin")
    process.exit(0);
}

const Items = new TF2Items({ //set up the items module
    apiKey: config.steamKey
});

Items.init(function(err) {
    if (err) {
        console.log(err)
    }
});

Items.on('ready', function() {
    console.log("schema loaded you may now add items to the bot");
});

const app = express(); //set up handlebars and express
const hbs = handlebars.create();

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(bodyParser.json()); //set view engine and css
app.use('/assets', express.static('assets'));
app.engine('hbs', hbs.engine);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

//nicks functions
function findMatch(search) { //function to get a defindex of a item
    search = search.toLowerCase();
    let match = [];
    const schema = Items.schema.items;
    for (let i = 0; i < schema.length; i++) {
        let name = schema[i].item_name;
        if (schema[i].proper_name == true) {
            name = "The " + name;
        }
        if (name.toLowerCase() == search) {
            return schema[i].defindex;
        } else if (name.toLowerCase().indexOf(search) != -1) {
            match.push(schema[i]);
        }
    }
    if (match.length == 0) {
        return null;
    } else if (match.length == 1) {
        return match[0].defindex;
    }
    for (let i = 0; i < match.length; i++) {
        let name = schema[i].item_name;
        if (schema[i].proper_name == true) {
            name = "The " + name;
        }
        match[i] = name;
    }
    return match;
}

function decimalPlaces(num) {
    var match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) {
        return 0;
    }
    return Math.max(0,
        // Number of digits right of decimal point.
        (match[1] ? match[1].length : 0)
        // Adjust for scientific notation.
        - (match[2] ? +match[2] : 0));
}

function trunc(number, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.floor(number * factor) / factor;
};

function plural(word, count) {
    return Math.abs(count) == 1 ? word : word + 's';
};

function currencyAsText(currencies) {
    var text = '';
    if (currencies.keys && currencies.keys != 0) {
        text = currencies.keys + ' ' + plural('key', currencies.keys);
    }
    if (currencies.metal && currencies.metal != 0) {
        if (text != '') {
            text += ', ';
        }
        text += (decimalPlaces(currencies.metal) == 2 ? currencies.metal : trunc(currencies.metal, 2)) + ' ref';
    }
    if (text == '') {
        return '0 keys, 0 ref';
    }
    return text;
};
//my function to get prices and make them pretty
function getPrices() {
    return new Promise((resolve, reject) => {
        let options = {
            method: 'GET',
            json: true,
            url: 'http://nicklas.io/api/v1/prices',
            qs: {
                key: config.priceKey
            }
        };
        request(options, function(error, response, body) {
            if (error) {
                reject(err);
            }

            const result = body.response;

            if (response.statusCode == 429) {
                reject(new Error('Wait ' + result.wait + ' ' + plural('second', result.wait)));
                return;
            } else if (600 > response.statusCode  && response.statusCode > 499) {
                reject(new Error('Server error'));
                return;
            } else if (response.statusCode != 200) {
                reject(new Error(result.message));
                return;
            }

            let items = []
            for (var i = 0; i < body.response.items.length; i++) {
                let buy = currencyAsText(body.response.items[i].price.buy)
                let sell = currencyAsText(body.response.items[i].price.sell)
                items.push({
                    "name": body.response.items[i].item.name,
                    "buy": 'Buying for ' + buy,
                    "sell": 'Selling for ' + sell,
                    "position": [i]
                })
            }
            resolve(items)
        });
    });
}

//my function to get a list of items in the pricelist
function getList() {
	console.log("getting list of items")
    return new Promise((resolve, reject) => {
        let options = {
            method: 'GET',
            url: 'http://nicklas.io/api/v1/list',
            json: true,
            qs: {
                key: config.priceKey
            },
        };
        request(options, function(error, response, body) {
            if (error) {
                reject(err)
            }
            if (body.response.success != true) {
                reject("wait some time to accses the list of items in the bot")
                return
            }
            let names = []
            for (var i = 0; i < body.response.items.length; i++) {
                names.push(body.response.items[i].item.name)
            }
            resolve(names)
        });
    });
}
//my function to remove items from the pricelsit
function removeItems(items) {
	console.log("removing items from the bot")
    return new Promise((resolve, reject) => {
        var options = {
            method: 'DELETE',
            url: 'http://nicklas.io/api/v1/list',
            headers: {
                "Content-Type": "application/json"
            },
            qs: {
                key: config.priceKey
            },
            body: items,
            json: true
        };
        request(options, function(error, response, body) {
            if (error) throw new Error(error);
            if (body.response.success != true) {
                reject("had some issues removing items from the bot")
                return
            }
            resolve(body.response)
        });
    });
}
//fucntion to add to bot 
function addItem(item) {
	console.log("adding item to bot")
    return new Promise((resolve, reject) => {
        let items = []
        items.push(item)
        var request = require("request");
        var options = {
            method: 'POST',
            json: true,
            url: 'http://nicklas.io/api/v1/list',
            qs: {
                key: config.priceKey
            },
            body: items
        };
        request(options, function(error, response, body) {
            if (error) throw new Error(error);
            if (body.response.success != true) {
                reject("had issues adding item to bot")
                return
            }
            resolve(body.response.success)
        });
    });
}
//routes
app.get('/', (req, res) => {
    res.redirect('/home');
});
app.get('/addItem', (req, res) => {
    res.render('addItem', {
        result: "add a item below"
    });
});
app.get('/home', (req, res) => {
    res.render('home');
});
app.get('/pricelist', (req, res) => {
    getPrices().then(list => {
        res.render('list', {
            items: list
        });
    }).catch((err) => {
        res.json('the script died send this to nick: ' + err)
    });
});
//psot requests and some messy logic
app.post('/addItem', function(req, res) {
    let url = URL.parse(req.body.url, true); //get the URL and parse it
    if (url.pathname != '/classifieds' || url.host != 'backpack.tf') {
        res.render('addItem', {
            result: "oh no your link does not look correct"
        });
        return
    }
    let querys = url.query //assign the query's from the passed URL to a variable
    let items = []
    let itemToAdd = { //generating object to add the item to the price-list
        defindex: findMatch(querys.item),
        quality: parseInt(querys.quality),
        craftable: parseInt(querys.craftable) == 1 ? true : false,
        killstreak: parseInt(querys.killstreak_tier),
        australium: parseInt(querys.australium) == 1 ? true : false,
    }
    items.push(itemToAdd)
    addItem(itemToAdd).then(status => {
        if (status == true) {
            res.render('addItem', {
                result: "item added to bot"
            });
        }
    }).catch((err) => {
        console.log(err)
        res.json('the script died send this to nick: ' + err)
    });
});
//more messy logic
app.post('/pricelist', (req, res) => {
    getList().then(list => {
        let items = req.body.name || [];
        if (items.length == 0) {
            res.json('You need to select items');
            return;
        }

        let names = []
        for (var i = 0; i < items.length; i++) {
            names.push(list[items[i]])
        }
        removeItems(names).then(response => {
            if (response.success == true) {
                getPrices().then(list => {
                    res.render('list', {
                        items: list,
                        result: response.removed + ' items removed from the pricelist'
                    });
                }).catch((err) => {
                    res.json('the script died send this to nick: ' + err)
                });
            } else {
                getPrices().then(list => {
                    res.render('list', {
                        items: list,
                        result: 'something broke no items removed'
                    });
                }).catch((err) => {
                    res.json('the script died send this to nick: ' + err)
                });
            }
        });
    }).catch((err) => {
        res.json('the script died send this to nick: ' + err)
        console.log(err);
    });
});
app.get('/add', (req, res) => {});
app.listen(3000, function() { //listen on port 3000
    console.log("listening on port 3000");
    require("openurl").open("http://localhost:3000/")
});