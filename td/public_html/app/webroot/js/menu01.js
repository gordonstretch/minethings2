////////////////////////////////////////
// PopUP
////////////////////////////////////////

var mt_map;

function OpenMap(destination) {
    if (mt_map == null) {
        mt_map = window.open(destination, 'map_popup', 'width=800, height=500, toolbar=0, location=0, directories=0, status=0, menubar=0, scrollbars=0, resizable=0');
        //mt_map.opener = self;
        //mt_map.changeCityRedirect = referrer;
    }
}

function CloseMap() {
    if (mt_map != null) {
        mt_map.close();
        mt_map = null;
    }
}

window.onfocus=CloseMap

/////////////////////////////////////////
// Battery
/////////////////////////////////////////

function TimeLeft(seconds) {
    var days = Math.floor(seconds/24/60/60);
    if (days > 1) {
        seconds -= days*24*60*60;
    }
    else {
        days = 0; // don't display days if it's just 1 day
    }

    var hours = Math.floor(seconds/60/60);
    seconds -= hours*60*60;
    var minutes = Math.floor(seconds/60);
    seconds -= minutes*60;
    var seconds = Math.floor(seconds);

    if (minutes < 10)
        minutes = "0"+minutes;
    if (seconds < 10)
        seconds = "0"+seconds;

    var timeString = "";
    if (days > 0) {
        timeString = days + "d ";
    }
    timeString += hours + ":" + minutes + ":" + seconds
    return timeString;
}

function OnMtTimer(spanid, expireTime) {
    var myDate = new Date();
    timeUntilExpiration = expireTime - myDate.getTime()/1000;
    if (timeUntilExpiration > 0)
        setTimeout("OnMtTimer('"+spanid+"',"+expireTime+")", 1000);
    else
        timeUntilExpiration = 0;

    timeString = TimeLeft(timeUntilExpiration);

    document.getElementById(spanid).innerHTML = timeString;
}


function PrintTimer(spanid, lifeLeft) {
    document.write("<span id='"+spanid+"'>123</span>");
    var myDate = new Date();
    var expireTime = myDate.getTime()/1000 + lifeLeft;
    OnMtTimer(spanid, expireTime);
}


//////////////////////////////////////////////////////////
//  Gold
//////////////////////////////////////////////////////////

var mtGold = 0;
var mtRate = 0;  //gold per hour
var mtUpdated = 0;

function CalcGold(gold, rate, updated) {
    var myDate = new Date();
    var delta = myDate.getTime()/1000 - updated;
    gold += delta * rate / 3600.0;
    return gold;
}


function Gold(roundGold) {
    gold = CalcGold(mtGold, mtRate, mtUpdated);

    if (!roundGold || gold < 10 || mtRate > 0)
        gold = gold.toFixed(4);
    else {
        gold = Math.floor(gold);
        while (/(\d+)(\d{3})/.test(gold.toString()))
            gold = gold.toString().replace(/(\d+)(\d{3})/, '$1'+','+'$2');
    }

    return gold;
}

function OnGoldTimer() {
    SetGold();

    if (mtRate > 0)
        setTimeout("OnGoldTimer()", 100);
}


function PrintGold(gold, rate, updated) {
    document.write('<b><a id="goldanchor" href="/transfers" title="" style="color:white"></a></b>');
    var myDate = new Date();
    updated = myDate.getTime()/1000 - updated;
    mtGold = gold;
    mtRate = rate;
    mtUpdated = updated;
    OnGoldTimer();
}

function SetGold(gold) {
    if (typeof gold !== 'undefined') {
        var before = CalcGold(mtGold, mtRate, mtUpdated);
        gold = parseFloat(gold);
        mtGold += (gold - before);
    }

    var goldString = Gold(true);
    var title = Gold(false);
    $("goldanchor").update(''+goldString+'g').writeAttribute('title', ''+title+' gold');

}

//////////////////////////////////////////////
// Findings/
//////////////////////////////////////////////

Event.observe(window, "load", onload, false);
function onload(){
    var link = $('MinesLink');
    link.observe('click', function() {
        link.observe('click', Event.stop); // next time they click it'll ignore
    });
}