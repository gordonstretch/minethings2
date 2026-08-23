<script>
	function onoil(request) {
		var json = request.responseText.evalJSON();
		$("ErrorDiv").update(json.message);
		if (!json.success)
			return;
		$$(".oiledtrips").each(function(span) { span.update(json.oiledTrips); });
		$$(".stolentrips").each(function(span) { span.update(json.tripsStolen); });
		$("LoadOilLink").setStyle({visibility:json.hasOil?"visible":"hidden"});
	}
</script>

<?
if (!$minersVehicle['MinersVehicle']['route_id']) {
	echo $ajax->link('[Oil]', '/vehicles/js_load_oil/'.$minersVehicle['MinersVehicle']['id'], array(
		'id' => 'LoadOilLink',
		'style' => $hasOil ? "" : "visibility:hidden",
		'indicator' => 'LoadingDiv',
		'complete' => 'onoil(request)',
		)).' ';

	if ($minersVehicle['MinersVehicle']['trips_stolen'])
		echo $ajax->link('[Unoil]', '/vehicles/js_load_oil/'.$minersVehicle['MinersVehicle']['id'].'/0', array(
				'id' => 'UnloadOilLink',
				'indicator' => 'LoadingDiv',
				'complete' => 'onoil(request)',
			)).' ';
}