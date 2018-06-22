const express = require('express');
const handlebars = require('express-handlebars');
const bodyParser = require('body-parser');
const path = require('path');
const URL = require('url');
const request = require('request')
const TF2Items = require('tf2-items');
const config = require('./config.js');
const Automatic = require('tf2automatic');

const options = {
    client_id: config.client_id,
    client_secret: config.client_secret
};

const automatic = new Automatic(options);

automatic.init(function (err) {
    if (err) {
        console.log(err);
        return;
    }
});

const Items = new TF2Items({ //set up the items module
    apiKey: config.steamKey
});

Items.init(function (err) {
    if (err) {
        console.log(err)
    }
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
        -
        (match[2] ? +match[2] : 0));
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

function getList() {
    let list = automatic.listings
    let items = []
    for (let i = 0; i < list.length; i++) {
        let buy = currencyAsText(list[i].prices.buy)
        let sell = currencyAsText(list[i].prices.sell)
        items.push({
            "name": list[i].name,
            "buy": 'Buying for ' + buy,
            "sell": 'Selling for ' + sell,
            "image": list[i].icon,
            "position": [i]
        })
    }
    return items;
};

function getItems() {
    let names = [];
    const listings = automatic.listings;
    for (let i = 0; i < listings.length; i++) {
        const name = listings[i].name;
        names.push(name);
    }
    return names;
}

app.get('/', (req, res) => {
    res.redirect('/home');
});

app.get('/home', (req, res) => {
    res.render('home');
});

app.get('/pricelist', (req, res) => {
    res.render('list', {
        items: getList()
    });
});

app.get('/addItem', (req, res) => {
    res.render('addItem', {
        result: "add a item below"
    });
});

app.post('/pricelist', (req, res) => {
    if (req.body.delete) {
        automatic.removeListings(getItems(), function (err) {
            if (!err) {
                res.render('list', {
                    items: getList(),
                    result: "all items have been removed, you monster"
                });
            } else {
                res.json("something broke sry " + err)
            }
        });
    }

    if (req.body.name) {
        let items = req.body.name || [];
        if (items.length == 0) {
            res.json('You need to select items');
            return;
        }
        let list = getItems()
        let names = []
        for (var i = 0; i < items.length; i++) {
            names.push(list[items[i]])
        }
        automatic.removeListings(names, function (err) {
            if (!err) {
                res.render('list', {
                    items: getList(),
                    result: "some items have been removed"
                });
            } else {
                res.json("something broke sry " + err)
            }
        });
    }
});

app.post('/additem', (req, res) => {
    let url = URL.parse(req.body.url, true); //get the URL and parse it
    if (url.pathname != '/classifieds' || url.host != 'backpack.tf') {
        res.render('addItem', {
            result: "oh no your link does not look correct"
        });
        return
    }
    let querys = url.query //assign the query's from the passed URL to a variable
    automatic.addListing({
        defindex: findMatch(querys.item),
        quality: parseInt(querys.quality),
        craftable: parseInt(querys.craftable) == 1 ? true : false,
        killstreak: parseInt(querys.killstreak_tier),
        australium: parseInt(querys.australium) == 1 ? true : false,
        effect: null,
        autoprice: true,
        enabled: true
    }, function (err, listing) {
        if (err) {
            res.render('addItem', {
                result: "well something broke go send this error to w3bb0: " + err
            });
        }
        res.render('addItem', {
            result: "item added, add a item below"
        });
    })
});

app.listen(3000, function () { //listen on port 3000
    console.log("listening on port 3000");
    require("openurl").open("http://localhost:3000/")
});