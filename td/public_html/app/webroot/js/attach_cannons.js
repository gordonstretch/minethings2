
function CountAll(fmobj) {
	count = 0;
	for(var i=0; i<fmobj.elements.length; i++)
	{
		var e = fmobj.elements[i];
		if ( (e.type=='checkbox') && (!e.disabled) && (e.checked) && (e.name.search('Cannon') != -1) ) {
			count++;
		}
	}
	return count;
}

var gCapacity = 0;

function PrintCapacity(capacity) {
	gCapacity=capacity;
	document.write("<span id='capacity'>"+capacity+"</span>");
}



function UpdateCapacity(fmobj) {

	selected = CountAll(fmobj);
	capacityRemaining = gCapacity - selected;

	fmobj.attach_button.disabled = capacityRemaining < 0;

	document.getElementById('capacity').innerHTML = capacityRemaining;
}


window.onload=function() {
	UpdateCapacity(document.forms['VehicleAttachCannonsForm']);
}
