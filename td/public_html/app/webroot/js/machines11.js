
var oilBoardWidth = 1000;
var oilBoardHeight = 900;
var oilBoardCenterX = oilBoardWidth / 2;
var oilBoardCenterY = 500;

function OilRackLayout(count) {
	var positions = [];
	if (!count)
		return positions;

	// Keep roughly half the parts above the field and balance the rest down
	// the two side rails. The 46 original machine variants all fit without
	// covering the playable hexes.
	var topCount = Math.min(20, Math.max(1, Math.ceil(count / 2)));
	var topRows = Math.ceil(topCount / 10);
	var placed = 0;
	for (var row = 0; row < topRows; row++) {
		var rowCount = Math.min(10, topCount - placed);
		var y = topRows === 1 ? 66 : (row === 0 ? 42 : 106);
		for (var column = 0; column < rowCount; column++) {
			var x = rowCount === 1 ? oilBoardCenterX : 70 + column * (860 / (rowCount - 1));
			positions.push({x:x, y:y, zone:'top'});
		}
		placed += rowCount;
	}

	var sideCount = count - topCount;
	var leftCount = Math.ceil(sideCount / 2);
	var rightCount = sideCount - leftCount;
	var addSide = function (amount, x, zone) {
		for (var index = 0; index < amount; index++) {
			var y = amount === 1 ? 240 : 170 + index * (660 / (amount - 1));
			positions.push({x:x, y:y, zone:zone});
		}
	};
	addSide(leftCount, 68, 'left');
	addSide(rightCount, oilBoardWidth - 68, 'right');
	return positions;
}

function DrawOilRackLabel(machine, position) {
	var width = position.zone === 'top' ? 82 : 108;
	var label = paper.text(position.x, position.y + 19,
		machine.MachineType.name.toUpperCase()).attr({
			fill:'#f1e7d1', 'font-family':'Arial, sans-serif', 'font-size':8, 'font-weight':'bold'
		});
	var badge = paper.rect(position.x + width / 2 - 27, position.y - 24,
		22, 13, 1).attr({fill:'#f09a24', stroke:'#f6bd62', 'stroke-width':0.75});
	var count = paper.text(position.x + width / 2 - 16, position.y - 17.5,
		'\u00d7'+machine.count).attr({
			fill:'#17120b', 'font-family':'Arial, sans-serif', 'font-size':8, 'font-weight':'bold'
		});
	var elements = [[label, 'oil-rack-label'],
		[badge, 'oil-rack-count-badge'], [count, 'oil-rack-count']];
	for (var index = 0; index < elements.length; index++) {
		elements[index][0].node.classList.add(elements[index][1]);
		elements[index][0].node.dataset.rackZone = position.zone;
		elements[index][0].node.style.pointerEvents = 'none';
	}
}

var drawboard = function () {
	paper = Raphael("board", oilBoardWidth, oilBoardHeight);
	barrels = paper.set();
		
	var center = Hex2Cart(0,0);
	paper.circle(center[0], center[1], 360)
		.attr({fill:'#111', 'fill-opacity':'.1'})
		.data('board', 1)
		.mouseover( function() { if (popup) popup.remove(); popup = null;});
	
	var time = new Date().valueOf()/1000 + timeOffset;
		
	// create hexes	
	for (var i = 0; i < hexes.length; i++)
	{
		hex = hexes[i];
		cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
		
		var side = (hexDiameter-2)/2.0;
		var point = side/4.0 + cartVector[0]*side;
		
		left = ""+(cart[0]-point)+" "+(cart[1]);
		topleft = ""+(cart[0]-side/2.0)+" "+(cart[1]+side);
		topright = ""+(cart[0]+side/2.0)+" "+(cart[1]+side);
		right = ""+(cart[0]+point)+" "+(cart[1]);
		bottomright = ""+(cart[0]+side/2.0)+" "+(cart[1]-side);
		bottomleft = ""+(cart[0]-side/2.0)+" "+(cart[1]-side);
		var path = "M"+left+"L"+topleft+"L"+topright+"L"+right+"L"+bottomright+"L"+bottomleft+"Z";
		var hexPath = paper.path(path);
		hexPath.data('path', path);
		hexPath.data('hex', hex);
		
		// fill colors
		var available = (Number(hex.Hex.available) === Number(oilBuildTiers.local)
			|| Number(hex.Hex.available) === Number(oilBuildTiers.helicopter) && hasHeli);
		var fill; 
		var fillOpacity = 1;
		if (hex.HexesMachine && hex.HexesMachine.miner_id == minerId)
			fill = "#F00"; // mine
		else if (hex.HexesMachine && hex.HexesMachine.miner_id) // someone else's
		{
			if (timeLastChecked && timeLastChecked < hex.HexesMachine.created)
				fill = '#CF3'; 
			else
				fill = "#0F0"; 
		}
		else if (hex.Oil && hex.Oil.oil >= oilspill)
			fill = "#444"; // oilspill
		else if (available)
			fill = "#44F"; // empty
		else
		{
			fill = "#DDD";			
			fillOpacity = .3;
		}		
		var rc = fill;
		if (hex.HexesMachine)
			rc = RarityColor(hex.HexesMachine.rarity);
		hexPath.data('rarityFill', rc);
		hexPath.data('teamFill', fill);	
		
		if (hex.HexesMachine)
		{
			var life = parseFloat(hex.HexesMachine.life) + hex.HexesMachine.life_rate * (time - hex.HexesMachine.life_update_time);
			fillOpacity =  Math.min(1.0, life/(3600.0*12));
		}
		
		lum = 100;
		if (hex.Oil) 
		{
			var oil = parseFloat(hex.Oil.oil) + hex.Oil.oil_rate * (time - hex.Oil.oil_update_time);
			var lum = Math.round(Math.max(0, 100-100*oil/(3600.0*12)));
			lum = Math.min(lum, 100);
			if (lum == 1)
				lum = 0; // fix bug where lum=1 makes it white
		}
		hexPath.data('oilStroke', "hsl(0,0%,"+lum+"%)");
		
		hexPath.data('availableStroke', (available ? '#00F' : '#FFF'));
			
		hexPath.attr({"fill": fill, "stroke": hexPath.data('oilStroke'), 'stroke-width': 3, 'fill-opacity': fillOpacity});		
		
		// show barrels
		if (hex.Oil)
		{
			var rad = 0.0;
			var d = hexDiameter * .35;
			for(var b = 0; b < hex.Oil.barrels; b++) {
				var bx = Math.cos(rad) * d + cart[0];
				var by = Math.sin(rad) * d + cart[1];
				barrels.push( paper.circle(bx, by, 2).attr({fill:'#000'}) );
				rad += 0.9666;
			}		
		}
		

		hexPath.mouseover(mouseover);
		
		hexPath.click(hexClick);
		
		boardHexes.push(hexPath);
	}
	
	// draw placed machines
	for(var i = 0; i < hexes.length; i++)
	{
		if (hexes[i].HexesMachine) {
			var hex = hexes[i];
			var cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
			var machine = machines[hex.HexesMachine.machine_id];
			var type = machineTypes[machine.Machine.machine_type_id];
			//var machine = machines[hex.Machine.id];
			
			var p = CreateMachine(type, paper, machine, {HexesMachine:hex.HexesMachine}, cart[0], cart[1]);
			if (p) {
				boardMachines.push(p);
				p.setPoint(hex.HexesMachine.point);			
			}
			else
				console.log('no such machine'+JSON.stringify(hex.HexesMachine));
		}
	}
	
	// draw queued machines
	for (var i = 0; i < hexes.length; i++) {
		hex = hexes[i];
		cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
		// show dot to indicate a queued machine
		if (hex.QueuedMachine) {
			paper.circle(cart[0], cart[1], 10).attr({stroke:'#00F', 'stroke-dasharray':'- '});
			// draw queued machine
			m = machines[hex.QueuedMachine.machine_id];
			type = machineTypes[m.Machine.machine_type_id];
			var qm = CreateMachine(type, paper, m, false, cart[0], cart[1]);
			if (qm)
			{
				qm.setPoint(hex.QueuedMachine.point);
				qm.hide();
				queuedMachines.push(qm);
			}
			else
				console.log('no machine of type '+type);
		}
	}
	
	
	// Available machine parts use the otherwise empty top and side perimeter.
	var rackLayout = OilRackLayout(ownedMachines.length);
	var rackCaption = paper.text(oilBoardCenterX, 14,
		ownedMachines.length ? 'MACHINE RACK  //  DRAG A PART TO ANY VALID HEX' : 'MACHINE RACK  //  NO PARTS AVAILABLE');
	rackCaption.node.classList.add('oil-rack-caption');
	rackCaption.node.style.pointerEvents = 'none';
	var p = null;
	for (var i = 0; i < ownedMachines.length; i++) {
		machine = ownedMachines[i];
		var position = rackLayout[i];
		var x = position.x;
		var y = position.y;
		DrawOilRackLabel(machine, position);
		
		var p = CreateMachine(machine.MachineType.name, paper, machine, false, x, y);
		if (p) {
			p.AddHandle(machine.Item.icon, hexDiameter);
			p.rackZone = position.zone;
		}
		else
			console.log('no such machine '+machine.MachineType.name);
	}
	
};

debugElement = false;
function PrintInfo(text)
{
	if (debugElement)
		debugElement.remove();
		
	var debugFont = {"font-family":"serif",
		"font-size":"16"};
	debugElement = paper.text(400, 10, text).attr(debugFont);
}

function GetHex(hexId)
{
	for( var i = 0; i < hexes.length; i++)
		if (hexes[i].Hex.id == hexId)
			return hexes[i];
	return false;
}

function Machine(paper, machine, hexesMachine, x, y) {
	this.pos = [x, y];
	this.startingPos = [x, y];
	this.point = 0; // which way it's facing
	this.paper = paper;
	this.machine = machine;
	this.hm = hexesMachine;
	this.animate = false;
	this.circle = false;
	this.canRotate = true;
}
Machine.prototype.hide = function () { 
	this.set.hide();
}
Machine.prototype.show = function () {
	this.set.show();
}
Machine.prototype.draw = function() {
}
Machine.prototype.CreateSet = function() {
	this.paper.setStart();
	this.draw();	
	this.set = this.paper.setFinish();	
}
Machine.prototype.AddHandle = function(iconHref, iconSize) {
	this.set.remove();
	this.set.clear();
	this.paper.setStart();
	this.createCircle(); // <- handle
	if (iconHref) {
		var size = Number(iconSize) || 30;
		this.rackIcon = this.paper.image(iconHref,
			this.pos[0] - size / 2, this.pos[1] - size / 2, size, size);
		this.rackIcon.node.classList.add('oil-rack-machine-icon');
		this.rackIcon.node.style.pointerEvents = 'none';
	} else
		this.draw();
	this.set = this.paper.setFinish();	
}
Machine.prototype.createCircle = function() {
	this.circle = paper.circle(this.pos[0], this.pos[1], 20)
		.attr({fill:'#FFF', 'fill-opacity':0.001, stroke:'none', cursor:'pointer'})
		.click( this.onclick.bind(this) );
}
Machine.prototype.getCenter = function() {
	return this.pos;
}		
Machine.prototype.setCenter = function(pos) {
	this.pos = pos;
	this.calcTransform();
}
Machine.prototype.setPoint = function(point) {
	if (!this.canRotate)
		return false;
		
	this.point = point;
	this.calcTransform();
}	
Machine.prototype.calcTransform = function() {
	var tx = this.pos[0] - this.startingPos[0];
	var ty = this.pos[1] - this.startingPos[1];
	rotation = this.point * 60;
	rp = this.startingPos;
	var trstr = "t"+tx+","+ty+"r"+rotation+','+rp[0]+','+rp[1];
	if (this.animate)
		this.set.animate({transform:trstr}, 200, this.animate);
	else
		this.set.transform(trstr);
	this.animate = false;	
}
Machine.prototype.rotateRight = function() {
	this.animate = 'linear';
	this.setPoint((this.point + 1) % 6);
}
Machine.prototype.rotateLeft = function() {
	this.animate = 'linear';
	this.setPoint((this.point + 5) % 6);
}
Machine.prototype.onclick = function(e) {
	if (this.circle)
		dialog.SetMachine(this);
}


function Pump(paper, machine, hm, x, y) {	
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
	this.canRotate = false;
}
Pump.prototype = new Machine();
Pump.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	paper.circle(x, y, 5);
}

function Beepy(paper, machine, hm, x, y) {	
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
	this.canRotate = false;
}
Beepy.prototype = new Machine();
Beepy.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.circle(x, y, 5);
	paper.circle(x, y-22, 3);
	paper.circle(x+19, y-11, 3);
	paper.circle(x+19, y+11, 3);
	paper.circle(x, y+22, 3);
	paper.circle(x-19, y-11, 3);
	paper.circle(x-19, y+11, 3);
	
}

function Pad(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
	this.canRotate = false;
}
Pad.prototype = new Machine();
Pad.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	this.rect = paper.rect(x-5, y-5, 10, 10);
}



function Power(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Power.prototype = new Machine();
Power.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	paper.path("M"+x+" "+(y-6)+"l3 9l-6 0z");
}

function Double(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Double.prototype = new Machine();
Double.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.path("M"+x+" "+(y-6)+"l3 9l-6 0z")
	paper.path('M'+(x+1)+' '+(y-2)+'l7 -1'+'l-6 6');
	
}

function Reaper(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Reaper.prototype = new Machine();
Reaper.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.path("M"+(x-3)+" "+(y-3)+'l3 -6'+'l3 6')
	paper.path("M"+x+" "+(y)+"l6.9 -4")
	paper.path("M"+x+" "+(y)+"l6.9 4")
	paper.path("M"+x+" "+(y)+"l0 8")
	paper.path("M"+x+" "+(y)+"l-6.9 4")
	paper.path("M"+x+" "+(y)+"l-6.9 -4")
	
	paper.circle(x+6.9, y+4, 2);
	paper.circle(x+6.9, y-4, 2);
	paper.circle(x, y+8, 2);
	paper.circle(x-6.9, y+4, 2);
	paper.circle(x-6.9, y-4, 2);
	
}

function Harvester(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Harvester.prototype = new Machine();
Harvester.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.path("M"+(x-3)+" "+(y-3)+'l3 -5'+'l3 5')
	paper.path("M"+x+" "+(y)+"l6.9 -4")
	paper.path("M"+x+" "+(y)+"l6.9 4")
	paper.path("M"+x+" "+(y)+"l0 8")
	paper.path("M"+x+" "+(y)+"l-6.9 4")
	paper.path("M"+x+" "+(y)+"l-6.9 -4")	
}



function Pipe(paper, machine, hm, x, y, model) {
	Machine.call(this, paper, machine, hm, x, y);
	this.model = model;
	this.CreateSet();
}
Pipe.prototype = new Machine();
Pipe.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	this.length = 22;
	var radian = -Math.PI/2.0 + this.model/100 * Math.PI/6;
	this.fromPos = [x + Math.cos(radian) * this.length, y + Math.sin(radian) * this.length];
	path = "M"+x+" "+(y-this.length)+"L"+x+" "+y+"L"+this.fromPos[0]+" "+this.fromPos[1];
	path += "M"+(x-3)+" "+(y-this.length+3)+"L"+x+" "+(y-this.length)+"L"+(x+3)+" "+(y-this.length+3); // arrow
	paper.path(path);
	
	if (this.hm && this.hm.HexesMachine.animation_rate > 0 && animate)
	{
		var t = 2000.0 / this.hm.HexesMachine.animation_rate;
		this.dropAnimation(this.pos, [this.pos[0], (this.pos[1]-this.length)], t);
		this.dropAnimation(this.fromPos, this.pos, t);		
	}
}
Pipe.prototype.dropAnimation = function(start, finish, t) {
	var ani = Raphael.animation({cx:finish[0], cy:finish[1]}, parseInt(t)).repeat(Infinity);
	var p = paper.circle(start[0], start[1], 2).attr({fill:'#000'}).animate(ani);	
}
		
	
function StraightPipe(paper, machine, hm, x, y, hexes, direction) {
	Machine.call(this, paper, machine, hm, x, y);
	this.hexes = hexes;
	this.direction = direction;
	this.CreateSet();
}
StraightPipe.prototype = new Machine();
StraightPipe.prototype.draw = function() {
	this.length = 22;
	this.length += (this.hexes-1)*hexDiameter;
	var start = [this.pos[0], this.pos[1]];
	var end = [this.pos[0], this.pos[1]-this.length];
	if (this.hexes > 1)
	{
		start[0]+=3;
		end[0]+=3;
	}
	path = "M"+end[0]+" "+end[1]+"L"+start[0]+" "+start[1];
	if (this.direction == 'out')
		path += "M"+(end[0]-3)+" "+(end[1]+3)+"L"+end[0]+" "+end[1]+"L"+(end[0]+3)+" "+(end[1]+3); // arrowhead
	else
		path += "M"+(start[0]-3)+" "+(start[1]-3)+"L"+start[0]+" "+start[1]+"L"+(start[0]+3)+" "+(start[1]-3); // arrowhead
	paper.path(path);
	
		
	if (this.hm && this.hm.HexesMachine.animation_rate > 0 && animate)
	{				
		var t = 2000.0 / this.hm.HexesMachine.animation_rate;		
		if (this.direction == 'in') {
			var tmp = start;
			start = end;
			end = tmp;
		}
		if (this.hexes == 2) {
			mid = [(start[0]+end[0])/2.0, (start[1]+end[1])/2.0];
			this.dropAnimation(start, mid, t);
			this.dropAnimation(mid, end, t);
		}
		else
			this.dropAnimation(start, end, t);
	}
}
StraightPipe.prototype.dropAnimation = function(start, finish, t) {
	var ani = Raphael.animation({cx:finish[0], cy:finish[1]}, parseInt(t)).repeat(Infinity);
	paper.circle(start[0], start[1], 2).attr({fill:'#000'}).animate(ani);	
}



function PumpPipe(paper, machine, hm, x, y) {	
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
PumpPipe.prototype = new Machine();
PumpPipe.prototype.dropAnimation = Pipe.prototype.dropAnimation;
PumpPipe.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	paper.circle(x, y, 5);
	
	paper.path('M'+x+' '+(y-5)+'l0 -17');
	paper.path('M'+(x-3)+' '+(y-19)+'l3 -3'+'l3 3');
	
	if (this.hm && this.hm.HexesMachine.animation_rate > 0 && animate)
	{
		var t = 2000.0 / this.hm.HexesMachine.animation_rate;
		this.dropAnimation([x, y-5], [x, y-22], t);
	}
}	

function PadPipe(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
}
PadPipe.prototype = new Machine();
PadPipe.prototype.dropAnimation = Pipe.prototype.dropAnimation;
PadPipe.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	this.rect = paper.rect(x-5, y-5, 10, 10);

	paper.path('M'+x+' '+(y-5)+'l0 -17');
	paper.path('M'+(x-3)+' '+(y-8)+'l3 3'+'l3 -3');
	
	if (this.hm && this.hm.HexesMachine.animation_rate > 0 && animate)
	{
		var t = 2000.0 / this.hm.HexesMachine.animation_rate;
		this.dropAnimation([x, y-22], [x, y-5], t);
	}
}


function Funnel(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
}
Funnel.prototype = new Machine();
Funnel.prototype.dropAnimation = Pipe.prototype.dropAnimation;
Funnel.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];

	paper.path('M'+x+' '+y+'l0 -22');
	paper.path('M'+(x-3)+' '+(y-19)+'l3 -3'+'l3 3');
	paper.path('M'+x+' '+y+'l19 11');
	paper.path('M'+x+' '+y+'l0 20');
	paper.path('M'+x+' '+y+'l-19 11');
	
	if (this.hm && this.hm.HexesMachine.animation_rate > 0 && animate)
	{
		var t = 2000.0 / this.hm.HexesMachine.animation_rate;
		this.dropAnimation([x, y], [x, y-20], t);
		
		
		var active = 0.0;
		for(var p = 0; p < 6; p++)
			active += ((1<<p) & this.hm.HexesMachine.animation_flag)>>p;		
			
		for (var p = 0; p < 6; p++) {
			if (!((1<<p) & this.hm.HexesMachine.animation_flag))
				continue;
			var range = 22;
			
			var r = 90 - p * 60;
			r *= Math.PI / 180;
			var cx = x + Math.cos(r) * range;
			var cy = y - Math.sin(r) * range;			
			t = 2000.0 / this.hm.HexesMachine.animation_rate * active;
			this.dropAnimation([cx, cy], [x, y], t);
		}
	}
}

function Vacuum(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
	this.canRotate = false;
}
Vacuum.prototype = new Machine();
Vacuum.prototype.dropAnimation = Pipe.prototype.dropAnimation;
Vacuum.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];

	this.rect = paper.rect(x-5, y-5, 10, 10);
	
	paper.path('M'+x+' '+(y-5)+'l0 -17');
	paper.path('M'+(x+5)+' '+(y-5)+'l12 -7.5');
	paper.path('M'+(x+5)+' '+(y+5)+'l12 7.5');
	paper.path('M'+x+' '+(y+5)+'l0 17');
	paper.path('M'+(x-5)+' '+(y+5)+'l-12 7.5');
	paper.path('M'+(x-5)+' '+(y-5)+'l-12 -7.5');
	
		
	if (this.hm && this.hm.HexesMachine.animation_rate > 0 && animate)
	{
		var active = 0.0;
		for(var p = 0; p < 6; p++)
			active += ((1<<p) & this.hm.HexesMachine.animation_flag)>>p;
		//alert(active);
			
		for (var p = 0; p < 6; p++) {
			if (!((1<<p) & this.hm.HexesMachine.animation_flag))
				continue;
			var range = 22;
			
			var r = 90 - p * 60;
			r *= Math.PI / 180;
			var cx = x + Math.cos(r) * range;
			var cy = y - Math.sin(r) * range;			
			var t = 2000.0 / this.hm.HexesMachine.animation_rate * active;
			this.dropAnimation([cx, cy], [x, y], t);
		}
	}
}

function Horizon(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
	this.canRotate = false;
}
Horizon.prototype = new Machine();
Horizon.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];

	this.rect = paper.rect(x-5, y-5, 10, 10);
	
	
	paper.path('M'+x+' '+(y-5)+'l0 -8');
	paper.path('M'+(x+3)+' '+(y-5)+'l4 -7');
	paper.path('M'+(x+5)+' '+(y-3)+'l7 -4');
	paper.path('M'+(x+5)+' '+(y)+'l8 0');
	paper.path('M'+(x+5)+' '+(y+3)+'l7 4');
	paper.path('M'+(x+3)+' '+(y+5)+'l4 7');	
	paper.path('M'+x+' '+(y+5)+'l0 8');
	paper.path('M'+(x-3)+' '+(y+5)+'l-4 7');		
	paper.path('M'+(x-5)+' '+(y+3)+'l-7 4');
	paper.path('M'+(x-5)+' '+(y)+'l-8 0');
	paper.path('M'+(x-5)+' '+(y-3)+'l-7 -4');
	paper.path('M'+(x-3)+' '+(y-5)+'l-4 -7');
	
	if (this.hm)
		paper.circle(x, y, 70).attr({stroke:'#F00', 'stroke-opacity':0.4});
	
}


function Siphon(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Siphon.prototype = new Machine();
Siphon.prototype.dropAnimation = Pipe.prototype.dropAnimation;
Siphon.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.path('M'+(x-6)+' '+(y-6)+'l12 12');
	paper.path('M'+(x+6)+' '+(y-6)+'l-12 12');
	paper.path('M'+(x-4)+' '+(y)+'l8 0');
	
	paper.path('M'+x+' '+y+'l0 -22');
	paper.path('M'+(x-3)+' '+(y-19)+'l3 -3'+'l3 3');
		
	var cart;
	if (this.hm && this.hm.HexesMachine.animation_flag)
	{
		hex = GetHex(this.hm.HexesMachine.animation_flag);
		cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
		paper.path('M'+x+' '+y+'M'+cart[0]+' '+cart[1]);
	}
		
	
	if (animate && this.hm && this.hm.HexesMachine.animation_rate > 0) {			
		var rate = 2000 / this.hm.HexesMachine.animation_rate;					
		this.dropAnimation([cart[0], cart[1]], [x, y], rate);
		this.dropAnimation([x, y], [x, y-22], rate);
	}	
}	


	
function Pelter(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Pelter.prototype = new Machine();
Pelter.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	paper.rect(x-4, y-6, 8, 8);	
	paper.path("M"+x+" "+(y-2)+"l0 6");
	paper.rect(x-2, y+4, 4, 4);

	if (animate && this.hm && this.hm.HexesMachine.animation_rate > 0) {
		var ani = Raphael.animation({cx:this.pos[0], cy:this.pos[1]-hexDiameter*this.hm.HexesMachine.power}, 2000).repeat(Infinity);
		this.rock = paper.circle(x, y, 2).attr({fill:'#fff'}).animate(ani);		
	}
	
}	

function Mallet(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Mallet.prototype = new Machine();
Mallet.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	paper.rect(x-2, y-6, 4, 12);	
	paper.rect(x-4, y-6, 8, 3).attr({fill:'#111'});

	if (animate && this.hm && this.hm.HexesMachine.animation_rate > 0) {
		var range = hexDiameter;
		var rate = 2000 / this.hm.HexesMachine.animation_rate;
		var ani = Raphael.animation({cx:this.pos[0], cy:this.pos[1]-range}, rate).repeat(Infinity);
		this.rock = paper.circle(x, y, 2).attr({fill:'#fff'}).animate(ani);		
	}
	
}	

function Zapper(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Zapper.prototype = new Machine();
Zapper.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.path('M'+(x-3)+' '+(y-7)
		+'l0 13'
		+'l8 2'
		+'l0 -3'
		+'l-6 -1'
		+'l0 -12'
		+'z'
		);		
	paper.path('M'+(x+2)+' '+(y+5)
		+'l0 -3'
		+'l-2 -2');

	if (animate && this.hm && this.hm.HexesMachine.animation_rate > 0) {
		var range = hexDiameter*this.hm.HexesMachine.animation_flag;
		var rate = 2000 / this.hm.HexesMachine.animation_rate;
		var ani = Raphael.animation({cx:this.pos[0], cy:this.pos[1]-range}, rate).repeat(Infinity);
		this.rock = paper.circle(x, y, 2).attr({fill:'#fff'}).animate(ani);		
	}
	
}	


function Grinder(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
	this.canRotate = false;
}
Grinder.prototype = new Machine();
Grinder.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.circle(x, y, 5);	

	if (animate && this.hm && this.hm.HexesMachine.animation_rate > 0) {
		for (var p = 0; p < 6; p++) {
			if (!((1<<p) & this.hm.HexesMachine.animation_flag))
				continue; // don't shoot our own
			var range = hexDiameter;
			var rate = 2000 / this.hm.HexesMachine.animation_rate;			
			
			var r = 90 - p * 60;
			r *= Math.PI / 180;
			var cx = x + Math.cos(r) * range;
			var cy = y - Math.sin(r) * range;
			var ani = Raphael.animation({cx:cx, cy:cy}, rate).repeat(Infinity);
			paper.circle(x, y, 2).attr({fill:'#fff'}).animate(ani);	
		}
	}	
}	

function Turret(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.canRotate = false;
	this.CreateSet();
}
Turret.prototype = new Machine();
Turret.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.circle(x, y, 5);
	paper.circle(x, y, 3);
	paper.circle(x, y, 2);

	if (this.hm)
	{
		range = 3;
		paper.circle(x, y, 14 + 28*range).attr({stroke:'#F00', 'stroke-opacity':0.4});
	}
	
	if (animate && this.hm && this.hm.HexesMachine.animation_rate > 0) {
		var id = this.hm.HexesMachine.animation_flag;
		var hex;
		for( var i = 0; i < hexes.length; i++)
			if (hexes[i].Hex.id == id)
				hex = hexes[i];
		var cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
		var rate = 2000 / this.hm.HexesMachine.animation_rate;			
		
		var ani = Raphael.animation({cx: cart[0], cy: cart[1]}, rate).repeat(Infinity);
		paper.circle(x, y, 2).attr({fill:'#fff'}).animate(ani);
	}	
}	

function Crane(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
	this.canRotate = false;
}
Crane.prototype = new Machine();
Crane.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];

	paper.path('M'+(x-1)+' '+(y+5)+'l0 -10');
	paper.path('M'+(x+1)+' '+(y+5)+'l0 -10');
	paper.path('M'+(x-5)+' '+(y-5)+'l10 0'+'l0 6'); // arm and cable
	paper.rect(x-5, y-5, 1, 1);
	
	if (this.hm)
	{
		range = this.hm.HexesMachine.animation_flag;
		paper.circle(x, y, 14 + 28*range).attr({stroke:'#F00', 'stroke-opacity':0.4});
	}
	
}


function Flak(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
	this.canRotate = false;
}
Flak.prototype = new Machine();
Flak.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];

	paper.path('M'+(x-5)+' '+(y+3)+'l10 0');
	paper.path('M'+(x-2)+' '+(y+3)+'l0 -4'+'l9 -3');
	paper.path('M'+(x-2)+' '+(y-2)+'l3 -1');
	paper.path('M'+(x-2)+' '+(y+0)+'l3 -1');
	
	if (this.hm)
	{
		range = this.hm.HexesMachine.animation_flag;
		paper.circle(x, y, 14 + 28*range).attr({stroke:'#0B0', 'stroke-opacity':0.4});
	}
	
}


function Drone(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
	this.canRotate = false;
}
Drone.prototype = new Machine();
Drone.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.circle(x, y-2, 4).attr({fill:'#000'});
	paper.path('M'+x+' '+(y+2)+'l4 4');
	paper.path('M'+x+' '+(y+2)+'l0 3');
	paper.path('M'+x+' '+(y+2)+'l-4 4');
		
	if (this.hm)
	{
		range = this.hm.HexesMachine.animation_flag;
		paper.circle(x, y, 14 + 28*range).attr({stroke:'#0B0', 'stroke-opacity':0.4});
	}
	
}

function Welder(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();	
}
Welder.prototype = new Machine();
Welder.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	
	paper.rect(x-2, y-2, 4, 7).attr({fill:'#000'});
	paper.path('M'+(x)+' '+(y-2)+'l0 -13');	
}



function Bomb(paper, machine, hm, x, y) {
	Machine.call(this, paper, machine, hm, x, y);
	this.CreateSet();
}
Bomb.prototype = new Machine();
Bomb.prototype.draw = function() {
	x = this.pos[0];
	y = this.pos[1];
	paper.ellipse(x, y, 4, 8);
	paper.path('M'+(x-3)+' '+(y+3)+'l-3 3l12 0l-3 -3');
}


function Dialog() {
	this.destination = false;
	this.machine = false;
	this.set = false;
}
Dialog.prototype.CreateButton = function(x,y,w,h,text,fontsize,callback) {
	button = paper.set();
	button.push(paper.rect(x, y, w, h, 4).attr({fill:'#F43'}));
	button.push(paper.text(x+w/2, y+h/2, text).attr({'font-size':fontsize, fill:'#bbb'}));
	button.push(paper.rect().attr(button.getBBox()).attr({opacity:0, fill:'#000', cursor:'pointer'}).click( callback ));
	return button;
}
Dialog.prototype.SetMachine = function(machine) {
	this.Dismiss();
	
	this.processing = false;
	
	this.machine = machine;	
	machine.circle.attr({'stroke-width':2});
	// show available hexes
	for(var i = 0; i < boardHexes.length; i++) 
		boardHexes[i].attr({stroke: boardHexes[i].data('availableStroke')});
	
	
	// draw the dlg
	var x;
	if (machine.pos[0] < oilBoardCenterX)
		x = oilBoardWidth - 350;
	else
		x = 50;
	var y = 10;

	buttonAttr = {opacity:0, fill:'#000', cursor:'pointer'};

	paper.setStart();
	var back = paper.rect(x, y, 300, 170, 10).attr({fill:'#333', 'fill-opacity':0.8});

	// draw rotate buttons
	this.CreateButton(x+20, y+20, 60, 60, 'L', 40, function () { dialog.machine.rotateLeft(); });	
	this.CreateButton(x+220, y+20, 60, 60, 'R', 40, function () { dialog.machine.rotateRight(); } );
	
	paper.text(x+150, y+60, '<-- Rotate -->').attr({'font-size':16, fill:'#bbb'});
	
	paper.text(x+150, y+95, 'Click destination below.').attr({'font-size':12, fill:'#bbb'});
	
	// deploy/queue/cancel buttons
	this.deploy = this.CreateButton(x+10, y+110, 80, 30,  'Deploy', 16, function() { dialog.Deploy(false); });
	this.deploy.hide();
	this.deployreplace = paper.text(x+50, y+155, '(replace)').attr({fill:'#F00'}).hide();
	
	this.queue = this.CreateButton(x+110, y+110, 80, 30, 'Queue', 16, function() { dialog.Deploy(true); } );
	this.queue.hide();
	this.queuereplace = paper.text(x+150, y+155, '(replace)').attr({fill:'#F00'}).hide();
	
	this.CreateButton(x+210, y+110, 80, 30, 'Cancel', 16, function() { dialog.Dismiss(); } );
	
	this.set = paper.setFinish();	
	
}
Dialog.prototype.SetHex = function(hexPath) {
	this.hexPath = hexPath;
	
	// move machine
	hex = this.hexPath.data('hex');
	cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
	this.machine.animate = 'backOut';
	this.machine.setCenter(cart);
	
	// show options 
	this.deploy.show();	
	this.queue.hide();
	this.queuereplace.hide();
	this.deployreplace.hide();
	
	// show queue button if own machine
	if (hex.HexesMachine && hex.HexesMachine.miner_id == minerId)
	{
		this.queue.show();
		this.deployreplace.show();
		if (hex.QueuedMachine)
			this.queuereplace.show();
	}	
};
Dialog.prototype.Deploy = function(queue) {
	if (this.processing)
		return;
	this.processing = true;
	var hex = this.hexPath.data('hex');
	queue = queue ? '1' : '0';
	var rrl = '/machines/js_drop/'+hex.Hex.id+'/'+this.machine.machine.Machine.id+'/'+this.machine.point+'/'+queue;
	new Ajax.Updater('fullcenter', rrl, {
		asynchronous:true, 
		evalScripts:true, 
		onLoading:function() {Element.show('LoadingDiv');},
		onComplete:function() {Element.hide('LoadingDiv');} 
		}); 
};
Dialog.prototype.Dismiss = function() {
	for(var i = 0; i < boardHexes.length; i++) 
		boardHexes[i].attr({stroke: boardHexes[i].data('oilStroke')});
	if (this.machine)
	{
		this.machine.animate = 'backOut';
		this.machine.setCenter(this.machine.startingPos);
		this.machine.circle.attr({'stroke-width':1});
		this.machine = false;
	}
	if (this.set)	
		this.set.remove();	
}
	

function mouseover() { 
	hex = this.data('hex');
	var info = '';
	info += '('+hex.Hex.x+','+hex.Hex.y+')';
	//info += 'hex '+hex.Hex.id;
	var time = new Date().valueOf()/1000 + timeOffset;

	var id = hex.Hex.id;
	for(var i = 0; i < hexes.length; i++)
	{
		var hm = hexes[i].HexesMachine;
		if (hm && hm.hex_id == id)
		{				
			miner = miners[hm.miner_id];	
			info += ' '+miner+"'s";
		
			var machine = machines[hm.machine_id];			
			info += "\n"+hex.HexesMachine.power +'kw';
			info += ' '+machineTypes[machine.Machine.machine_type_id];
			
			var life = parseFloat(hex.HexesMachine.life) + hex.HexesMachine.life_rate * (time - hex.HexesMachine.life_update_time);
			if (life > 0)
				seconds = TimeLeft(life);
			else
				seconds = 'over';
			
			info += '\nlife: '+ seconds + ' ' +hex.HexesMachine.life_rate+'s/s';
						
			var machine = machines[hm.machine_id];
			var type = machineTypes[machine.Machine.machine_type_id];
			if ((type == 'pad-pipe' || type == 'pad' || type == 'vacuum' || type == 'horizon') && hex.Oil)
			{
				var padOil = parseInt((parseFloat(hex.Oil.barrel_oil) + hex.Oil.barrel_oil_rate * (time - hex.Oil.barrel_oil_update_time))/unitsPerLiter);
				if (padOil >= unitsPerBarrel/unitsPerLiter)
					padOil = 'sealing';
				else
					padOil = ''+padOil+'L';
				var por = Math.round((parseFloat(hex.Oil.barrel_oil_rate)/unitsPerLiter) * 3600 * 10)/10;
				info += '\nbarrel: '+ padOil + ' ' + por +'L/h';
			}
				
			if (type.search('pipe') != -1 || type == 'shortin' || type == 'shortout' || type == 'longin' || type == 'longout' || type == 'funnel' || type == 'vacuum' || type == 'horizon' || type == 'siphon')
			{
				piper = Math.round((parseFloat(hm.animation_rate)/unitsPerLiter) * 3600 * 10)/10;
				info += '\npipe: '+ piper + 'L/h';
			}
				
		}
		
	}
	
	if (hex.Oil) {
		var oil = (parseFloat(hex.Oil.oil) + hex.Oil.oil_rate * (time - hex.Oil.oil_update_time))/unitsPerLiter;
		var hor = Math.round((parseFloat(hex.Oil.oil_rate)/unitsPerLiter) * 3600 * 10)/10.0;
		info += '\nhex oil:'+ parseInt(oil)+'L '+hor+'L/h';
		if (hex.Oil.barrels > 0)
			info += '\nbarrels: '+hex.Oil.barrels;
	}
	else
		info += '\noil: [no search plane]';
	
	if (popup)
		popup.remove();
	cart = Hex2Cart(hex.Hex.x, hex.Hex.y);
	popup = paper.set();
	var x = 80;
	var y = 0;
	if (hex.Hex.x > 0)
		x -= 370; // put it on the left side	
	if (hex.Hex.y < 0)
		y -= 180;	
	popup.push( paper.rect(cart[0]+x, cart[1]+y, 210, 170).attr({fill:'#333', 'fill-opacity':'.7'}));
	x = cart[0]+x+110;
	y = cart[1]+y+85;
	popup.push( paper.text(x, y, info).attr({'font-size':'20', 'text-align':'left', 'fill':'#ddd'}));
	
	popup.forEach(function(e){e.hover(function(){ popup.remove(); });});
	
	
}



function hexClick () {
	var hex = this.data('hex');
	if (dialog.machine)
	{
		dialog.SetHex(this);
	}
	else if (hex.HexesMachine.id) {
		var machine = machines[hex.HexesMachine.machine_id];
		var type = machineTypes[machine.Machine.machine_type_id];
		if ((type == 'pad' || type == 'pad-pipe' || type == 'vacuum' || type == 'horizon') && hex.HexesMachine.miner_id == minerId)	{
			var rrl = '/machines/js_fetch_barrel/'+hex.Hex.id;
			new Ajax.Updater('fullcenter', rrl, {
				asynchronous:true, 
				evalScripts:true,
				onLoading:function() {Element.show('LoadingDiv');},
				onComplete:function() {Element.hide('LoadingDiv');} 
				}); 			
		}	
	}
}

function ToggleQueued() { 
	if (!teamFill)
		ToggleBoardColors();
	showQueued = !showQueued;
	for (var i = 0; i < boardMachines.length; i++)
		if (showQueued)
			boardMachines[i].hide();
		else
			boardMachines[i].show();
	for (var i = 0; i < queuedMachines.length; i++)
		if (showQueued)
			queuedMachines[i].show();
		else
			queuedMachines[i].hide();
}

function ToggleAnimation() {
	if (showQueued)
		ToggleQueued();
	animate = !animate;
	for(var i = 0; i < boardMachines.length; i++)
	{
		// redraw
		boardMachines[i].set.remove();
		boardMachines[i].CreateSet();
		boardMachines[i].calcTransform();
	}
}

function ToggleBoardColors() {
	if (showQueued)
		ToggleQueued();
	teamFill = !teamFill;
	for(var i = 0; i < boardHexes.length; i++)
	{	
		p = boardHexes[i];
		if (teamFill)
			p.attr({fill:p.data('teamFill')});
		else
			p.attr({fill:p.data('rarityFill')});
	}
}

function RarityColor(rarity) {
	var color;
	switch(rarity) {
		case '0': color = '#777'; break;
		case '1': color = '#d8be32'; break;
		case '2': color = '#698b18'; break;
		case '3': color = '#799c9c'; break;
		case '4': color = '#e32121'; break;
		case '5': color = '#a64891'; break;
		case '6': color = '#f79721'; break;
		default: color = '#000'; break;		
	}
	return color;
}

function Hex2Cart(x, y)
{
	var cartX = oilBoardCenterX + x * cartVector[0] * hexDiameter;
	var cartY = oilBoardCenterY - x * cartVector[1] * hexDiameter;
	cartY -= y * hexDiameter;
	
	return [cartX, cartY];
}


function CreateMachine(typeName, paper, machine, hexesMachine, x, y) {
	var p = false;
	switch(typeName) {
		case 'pump': 
			p = new Pump(paper, machine, hexesMachine, x, y); break;
		case 'pad':
			p = new Pad(paper, machine, hexesMachine, x, y); break;
		case 'power':
			p = new Power(paper, machine, hexesMachine, x, y); break;
		case 'pelter':
			p = new Pelter(paper, machine, hexesMachine, x, y); break;
		case 'pipe200':
			p = new Pipe(paper, machine, hexesMachine, x, y, 200); break;
		case 'pipe400':
			p = new Pipe(paper, machine, hexesMachine, x, y, 400); break;
		case 'pipe600':
			p = new Pipe(paper, machine, hexesMachine, x, y, 600); break;
		case 'pipe800':
			p = new Pipe(paper, machine, hexesMachine, x, y, 800); break;
		case 'pipe1000':
			p = new Pipe(paper, machine, hexesMachine, x, y, 1000); break;
		case 'shortin':
			p = new StraightPipe(paper, machine, hexesMachine, x, y, 1, 'in'); break;
		case 'shortout':
			p = new StraightPipe(paper, machine, hexesMachine, x, y, 1, 'out'); break;
		case 'longin':
			p = new StraightPipe(paper, machine, hexesMachine, x, y, 2, 'in'); break;
		case 'longout':
			p = new StraightPipe(paper, machine, hexesMachine, x, y, 2, 'out'); break;
		case 'flower':
		case 'thumper':
			p = new Bomb(paper, machine, hexesMachine, x, y); break;
		case 'mallet':
			p = new Mallet(paper, machine, hexesMachine, x, y); break;
		case 'zapper':
			p = new Zapper(paper, machine, hexesMachine, x, y); break;
		case 'grinder':
			p = new Grinder(paper, machine, hexesMachine, x, y); break;
		case 'turret':
			p = new Turret(paper, machine, hexesMachine, x, y); break;
		case 'double':
			p = new Double(paper, machine, hexesMachine, x, y); break;
		case 'reaper':
			p = new Reaper(paper, machine, hexesMachine, x, y); break;
		case 'harvester':
			p = new Harvester(paper, machine, hexesMachine, x, y); break;
		case 'pump-pipe': 
			p = new PumpPipe(paper, machine, hexesMachine, x, y); break;
		case 'pad-pipe':
			p = new PadPipe(paper, machine, hexesMachine, x, y); break;
		case 'funnel':
			p = new Funnel(paper, machine, hexesMachine, x, y); break;
		case 'vacuum':
			p = new Vacuum(paper, machine, hexesMachine, x, y); break;
		case 'beepy':
			p = new Beepy(paper, machine, hexesMachine, x, y); break;
		case 'horizon':
			p = new Horizon(paper, machine, hexesMachine, x, y); break;
		case 'siphon':
			p = new Siphon(paper, machine, hexesMachine, x, y); break;
		case 'crane':
			p = new Crane(paper, machine, hexesMachine, x, y); break;
		case 'flak':
		case 'flakb':
			p = new Flak(paper, machine, hexesMachine, x, y); break;
		case 'drone':
			p = new Drone(paper, machine, hexesMachine, x, y); break;
		case 'welder':
		case 'welderb':
			p = new Welder(paper, machine, hexesMachine, x, y); break;
	}
	return p;

}
