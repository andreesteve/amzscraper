function timeout(message) {
    this.capture("timeout.jpg");
    console.error(message || "Timeout");
    this.exit();
}

var casper = require('casper').create({
    verbose: true,
    logLevel: 'debug',
    onStepTimeout: timeout,
    onWaitTimeout: timeout,
    onTimeout: timeout,
    clientScripts: ["clientScripts/jquery-2.2.0.min.js"]
});

var system = require('system');
var fs = require('fs');

function getInput(message) {
    console.log(message);
    return system.stdin.readLine();
}

function waitForAndClick(selector) {
    casper.waitFor(function() {
        return this.exists(selector);
    }, function() {
        this.click(selector);
    });
}

function getArg(args) {
    for (var i = 0; i < args.length; i++) {
        var arg = args[i];
        if (casper.cli.has(arg)) {
            return casper.cli.get(arg);
        }
    }
}

function showHelpAndExit() {
    console.log("amzscraper --output=path_to_output_folder [--user=amzon_username]");
    casper.exit();
    phantom.exit();
}

function getRequiredArg(args) {
    var value = getArg(args);
    if (!value) {
        showHelpAndExit();
    }

    return value;
}

function endsWith(str, end) {
    str = str || "";
    return str.charAt(str.length) == end;
}

var username;
var password;
var captcha;
var captchaValue;
var invoiceFolder;

invoiceFolder = getRequiredArg(["output"]);

if (!endsWith(invoiceFolder, fs.separator)) {
    invoiceFolder = invoiceFolder + fs.separator;
}

casper.log("Invoice path: " + invoiceFolder, "info");

if (!fs.exists(invoiceFolder)) {
    casper.log("Invoice path does not exist. Creating it.", "info");
    fs.makeTree(invoiceFolder);
}

username = getArg(["user"]) || getInput('Username: ');
password = getInput('Password: ');

casper.log("Username: " + username, "info");

casper.userAgent('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)');

// go to portal home
casper.start('http://www.amazon.com');

// click on sign in
casper.thenClick('a[data-nav-role="signin"]');

// logon
casper.then(function() {
    console.log("Filling logon form.");

    var inputForm = {
        'email': username,
        'password': password
    };

    if (captchaValue) {
        inputForm['guess'] = captchaValue
    }
    
    this.fill('form', inputForm, true);
    
    captcha = false;
    captchaValue = '';
});

// check for captcha
casper.waitFor(function() {
    var result = false;
    if (this.exists("#auth-captcha-image")) {
        captcha = true;
        result = true;
    } else if (this.exists('#nav_prefetch_yourorders')) {
        result = true;
    }
    
    return result;
}, null, timeout);

// decide: go back to logon to provide captcha or continue to order page
casper.then(function() {  
    if (captcha) {
        this.capture("captcha.jpg");
        console.log("Captcha logon required. Please open 'captcha.jpg' and type in the captcha.");
        captchaValue = getInput("Captcha: ");

        // go back to logon
        this.bypass(-3);
    } else {    
        console.log("logon complete");
        // click on order button
        this.click("#nav_prefetch_yourorders");
    }
});

// click on order date range
waitForAndClick('#a-autoid-1-announce');

// select specific year -- hardcoded to 2015 TODO: allow selection
waitForAndClick("#orderFilter_3");

// wait until order page is loaded
casper.wait(1000);
casper.waitFor(function() {
    return this.exists("#yourOrdersContent");
});

var page = 0;
var hasNextPage = false;
var nextPageSelector = '.a-pagination .a-last:not(.a-disabled) a';

// parse html and download invoices
casper.then(function() {
    page++;
    hasNextPage = false;
    
    console.log("Order page " + page + " loaded.");
    
    var invoicePageDetails = this.evaluate(function(currentPage, nextPageSelector) {
        var urls = [];

        // iterate over invoice links on page
        jQuery('#ordersContainer div.a-box.a-color-offset-background.order-info a').each(function(index, value) {
            var $value = jQuery(value);
            if ($value.text() == "Invoice") {
                urls.push($value.attr('href'));
            }
        });

        var hasNextPage = jQuery(nextPageSelector).length > 0;
        
        // has next page        
        return {
            invoiceUrls: urls,
            hasNextPage: hasNextPage
            //nextPageButtonIndex = nextPageButtonIndex
        };
    }, page, nextPageSelector);

    var invoiceUrls = invoicePageDetails.invoiceUrls;
    hasNextPage = invoicePageDetails.hasNextPage;
    
    console.log("Page: " + page + ". Found " + invoiceUrls.length + " invoices.");

    var i = 1;
    casper.each(invoiceUrls, function(casper, url) {
        console.log("Page: " + page + ". Downloading invoice " + i + " of " + invoiceUrls.length);
        casper.download(url, invoiceFolder + "invoice_" + page + "_" + i + ".html");
        i++;
    });
});

// decide to go to next page or finish
casper.then(function() {
    if (hasNextPage) {
        this.click(nextPageSelector);
        
        // go back to order download
        this.bypass(-4);
    }
});

// start
casper.run();
