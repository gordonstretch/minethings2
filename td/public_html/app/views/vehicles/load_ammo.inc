<?
if (!$minersVehicle['MinersVehicle']['route_id'])
{
	$mvid = $minersVehicle['MinersVehicle']['id'];
	$aIds = [];
	$statIds = [];
	foreach($crateCounts as $type => $count)
	{
		$ammoName = $ammoNames[$type];
		$aId = str_replace(' ', '', 'Load'.$ammoName.'Link');
		$aIds[$type] = $aId;
		$statId = str_replace(' ', '', strtolower($ammoName)).'s';
		$statIds[] = $statId;
		
		echo $ajax->link('['.$ammoName.']', '/vehicles/js_load_ammo/'.$mvid.'/'.$type, array(
			'id' => $aId,
			'style' => $count ? '' : "visibility:hidden;",
			'indicator' => 'LoadingDiv',
			'complete' => ''
				.'data = request.responseText.evalJSON();'
				.'if (data.error) '
				.'	$("ErrorDiv").update(data.error);'					
				.'if (data.success) {'
					.'$$(".'.$statId.'").each(function(span) { span.update(data.onShip); });'
					.'if (typeof (gStats) != "undefined")'
					.'	gStats["capacity"]--;'
					.'$$(".capacity").each(function(span) { c = Number(span.innerHTML); span.update(c-1); });'
					.'if (!data.cratesLeft)'
					.'	$("'.$aId.'").setStyle({visibility:"hidden"});'	
				.'}'					
			)).' ';
	}
	
	echo $ajax->link('Unload Ammo', '/vehicles/js_load_ammo/'.$mvid.'/unload', array(
		'indicator' => 'LoadingDiv',
		'complete' => ''
			.'data = request.responseText.evalJSON();'
			.'if (data.error) '
			.'	$("ErrorDiv").update(data.error);'					
			.'if (!data.success)'
			.'	return;'
			.'var statIds = '.json_encode($statIds).';'
			.'statIds.forEach(function(statId) { $$("."+statId).each(function(span) { span.update("0"); }); });'
			.'if (typeof (gStats) != "undefined")'
			.'	gStats["capacity"] = data.capacity;'
			.'$$(".capacity").each(function(span) { span.update(data.capacity); });'
			.'var aIds = '.json_encode($aIds).';'
			.'for (type in aIds)'
			.'	if (data.cratesMade[type]) $(aIds[type]).setStyle({visibility:"visible"});'
		)).' ';
}
