function SelectPrevious(arms) {
	if (arms)
		l = $$(".arms");
	else
		l = $$(".cargo");
	l.each(function(c) { 
		c.checked = true; }); 
	l = $$(".inventory");
	l.each(function(c) {
		c.checked = false; }); 
		
	UpdateUI($("VehicleConfirmSendForm"));
}

var gStats = {};

function SaveStat(name, value) {
	gStats[name]=Number(value);	
}
//===========================================
// Clear all checkboxes
//===========================================
function ClearAll(fmobj) {
	for(var i=0; i<fmobj.elements.length; i++)
	{
		var e = fmobj.elements[i];
		if ( (e.type=='checkbox') && (!e.disabled) && (e.name.search('ItemsMiner') != -1 || e.name.search('allbox') != -1) ) {
			e.checked = false;
		}
	}
	UpdateUI(fmobj);
}

function CheckAll(fmobj, className) {
	// find the allbox
	var allBox;
	for(var i=0;i<fmobj.elements.length;i++) {
		var e = fmobj.elements[i];
		if ( e.name == "allbox_"+className) {
			allBox = e;
			break;
		}
	}

	selected = CountAll(fmobj);

	for (var i=0;i<fmobj.elements.length;i++) {
		var e = fmobj.elements[i];
		if ( (e.name != 'allbox') && (e.type=='checkbox') && (e.hasClassName(className)) && (!e.disabled) && (e.checked != allBox.checked)) {
			if (gStats['capacity'] > selected || !allBox.checked)
			{
				e.checked = allBox.checked;
				selected++;
			}
		}
	}
	UpdateUI(fmobj);
}

function CountAll(fmobj) {
	count = 0;
	for(var i=0; i<fmobj.elements.length; i++)
	{
		var e = fmobj.elements[i];
		if ( (e.type=='checkbox') && (!e.disabled) && (e.checked) && (e.name.search('ItemsMiner') != -1) ) {
			count++;
		}
	}
	return count;
}




function UpdateUI(fmobj) {

	// capacity
	selected = CountAll(fmobj);
	capacityRemaining = gStats['capacity'] - selected;
	sendEnabled = true;
	if (capacityRemaining < 0) {
		sendEnabled = false;
		reason = 'Capacity < 0';
	}
	$$('.capacity').each(function(span){
		span.update(capacityRemaining);
		});

	// check that route is valid
	route = $('MinersVehicleRouteId');
	if (route.value == 0)
	{
		sendEnabled = false;
		reason = 'Select Route';
	}
	
	// enable agg sentry
	if ($("AggSentry")) {
		var colors = $$('.AggCheckbox');
		var agg = 0;
		for (var i = 0; i < colors.length; i++) {
			if (colors[i].checked)
				agg = 1;
		}
		if (!agg)
			$("AggSentry").checked = 0;
		$("AggSentry").disabled = !agg;
	}
	
		
	// offense/defense
	offense = 0;
	defense = 0;
	pattern = new RegExp("\\((\\d+)/(\\d+)\\)", "");
	for(var i=0; i<fmobj.elements.length; i++)
	{
		var e = fmobj.elements[i];
		e = Element.extend(e);
		if (e.checked)
		{
			label = e.next('label');
			stats = pattern.exec(label.innerHTML);
			if (stats)
			{
				offense += Number(stats[1]);
				defense += Number(stats[2]);
			}
		}
	}	
	offense = Math.round((gStats['offense'] + offense * offenseMultiplier)*10)/10;
	defense = Math.round((gStats['defense'] + defense * defenseMultiplier)*10)/10;
	if ($$('.offense').length)
	{
		$$('.offense').each(function(span) { span.update(offense); });
		if (offense < 0)
		{
			sendEnabled = false;
			reason = 'Offense < 0';
		}
	}
	if ($$('.defense').length)
	{
		$$('.defense').each(function(span) { span.update(defense); });
		if (defense < 0)
		{
			sendEnabled = false;
			reason = 'Defense < 0';
		}
	}
		
	// enable/disable send button
	var buttons = $$('.send_button');
	for(var i = 0; i < buttons.length; i++)
	{
		buttons[i].disabled = !sendEnabled;
		
		if (sendEnabled)
			buttons[i].value = 'Send';
		else
			buttons[i].value = reason;
	}

}


window.onload=function() {
	UpdateUI(document.forms['VehicleConfirmSendForm']);
}
