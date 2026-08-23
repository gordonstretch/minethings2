function AttachmentUpdate() {
	divList = window.divList;
	statNames = window.statNames;
	vehicleStats = window.vehicleStats;
	
	var boltsNeeded = 0;
	
	if (!divList || !statNames)
	{
		alert('divList or statNames are null/false');
		return;
	}

	statValues = {};
	for ( var s = 0; s < statNames.length; s++)
		if (vehicleStats[statNames[s]])
			statValues[statNames[s]] = Number(vehicleStats[statNames[s]]);
		else
			statValues[statNames[s]] = 0;
		
		
	var attachments = 0;
	for (var i=0; i < divList.length; i++) {
		var div = divList[i];
		
		if (Number(div.down('.attachmenttoggle').value)){
			if (!Number(div.down('.attachmentinstalled').value)) {
				boltDiv = div.down('.boltsNeeded');
				boltsNeeded += Number(boltDiv.innerHTML);
				mult = 1;
			}
			else
				mult = 0;
			attachments++;
			div.setStyle({backgroundColor: '#FFF'});
		}
		else {
			if (!Number(div.down('.attachmentinstalled').value)) 
				mult = 0;
			else
				mult = -1;
			div.setStyle({backgroundColor: 'transparent'});
		}
		
		var statSpans = div.select('span');
		for (var j = 0; j < statSpans.length; j++) {
			node = statSpans[j];
			if (node.className) {
				var v = Number(node.innerHTML);
				statValues[node.className] += v * mult;
			}
		}					
	}
	$("attachments").update(attachments);
	
	var installable = 1;
	var culprit;
	for (var s = 0; s < statNames.length; s++) {
		name = statNames[s];
		var v = Math.round(statValues[name]*10)/10;
		$(name).update(v);
		
		if (v < 0 && correctableStatNames.indexOf(name) == -1) {
			installable = 0;
			culprit = name;
		}
	}
	button = $("InstallButton");
	if (installable) {
		button.enable();
		button.value = 'Install';
	}
	else {
		$("InstallButton").disable();
		button.value = culprit+' must be at least zero.';
	}
	
		
	$("BoltsNeeded").update(boltsNeeded);
}

function Reset()
{
	divList = window.divList;

	for (var i=0; i < divList.length; i++) {
		divList[i].down('.attachmenttoggle').value = divList[i].down('.attachmentinstalled').value;
	}
	
	AttachmentUpdate();
}

function Clear()
{
	divList = window.divList;

	for (var i=0; i < divList.length; i++) {
		divList[i].down('.attachmenttoggle').value = "0";
	}
	
	AttachmentUpdate();
}
