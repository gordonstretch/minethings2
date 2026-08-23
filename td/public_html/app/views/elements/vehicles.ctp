<?
	echo '<STYLE TYPE="text/css">';
	echo 'TD{font-family: Arial; font-size: 10pt; padding:5px; }';
	echo 'TH{font-family: Arial; font-size: 10pt; font-weight: bold;}';
	echo 'TABLE{ border-spacing:0px; }';
	echo '</STYLE>';
	
	$sendableIds = array();
	
	echo '<table border=1 >';
	echo $html->tableHeaders(array("Name", $columnHeading, "Dep-Arr", "Km Left", "A/C/O/S", "Send") );
	foreach($vehicles as $veh)
	{
		$veh['vehicleName'] = preg_replace('/ /', '&nbsp;', $veh['vehicleName']);
		$veh['minersVehicleName'] = preg_replace('/ /', '&nbsp;', $veh['minersVehicleName']);

		$cells = array();
		$name= '';
		if ($veh['tierRank'])
			$name.= $html->link(
				$html->image('rankings/R'.$veh['tierRank'].'C1.png', array('height' => 14, 'width' => 9, 'style' => 'margin-right:3px'))
				, '/ratings', array('escape' => false));
		$name .= $veh['minersVehicleName'];
		$cells[] = $name;
		$cells[] = $html->link($veh['vehicleName'], '/items/view/'.$veh['itemId'], array(
			'class' => $itemList->GetRarityClass($veh['rarity']),
			'style' => 'background-image:url('.$html->base.$veh['icon'].')',
			'escape' => false,
			));
		$cells[] = $veh['cityName'].(strlen($veh['destinationCity']) ? ' - '.$veh['destinationCity'] : '');
		$cells[] = $veh['distanceRemaining'];
		$stats = $veh['attachments'].'/'.$veh['cargoSize'].'/'.$veh['oiledtrips'].'/'.$veh['speed'];
		$cells[] = $html->link($stats, '/vehicles/check_status/'.$veh['id']);
		if ($veh['status'] == 'stopped' and $canUse and $veh['departingCityId'])
		{
			$cells[] = $html->link("send", '/vehicles/send/'.$veh['id']);
			$cell = $form->input('city_id', array(
				'id' => 'quicksenddropdown'.$veh['id'],
				'label' => false,
				'options' => $veh['cityOptions'], // (value => label)
				));
			$cell.= $html->link('[quick send]', '/vehicles/js_quicksend/'.$veh['id'].'/0', array(
				'id' => 'quicksendlink'.$veh['id'],
				'onclick' => 'return false;',
				'style' => 'display:none',
				'title' => 'Send with same armaments and aggressiveness.',
				));
			if (isset($errorVehicleId) and $errorVehicleId == $veh['id'])
				$cell.='<p>'.$vehicleError.'</p>';
			$sendableIds[] = $veh['id'];
			$cells[] = $cell;
		}
		else if ($canUse and $veh['departingCityId'])
			$cells[] = '['.$veh['status'].']';
		else
			$cells[] = '[NA]';
		
		# don't style them, it adds too much text to download (need to learn css better)
		#$styledCells = array();
		#foreach($cells as $c)
		#	$styledCells[] = array($c, array('class' => 'vehicles'));
		
		echo $html->tableCells(array($cells));
	}
	echo "</table>";
	
?>


<SCRIPT>
var vehIds = <? echo json_encode($sendableIds); ?>;
for (var i = 0; i < vehIds.length; i++)
{
	$('quicksenddropdown'+vehIds[i]).store('vehid', vehIds[i]);
	
	Event.observe('quicksenddropdown'+vehIds[i], 'change', function(event) { 
		var vehId = this.retrieve('vehid');
		$("quicksendlink"+vehId).show(); 
		var href = $("quicksendlink"+vehId).readAttribute("href"); 
		var islash = href.lastIndexOf("/"); 
		$("quicksendlink"+vehId).writeAttribute("href", href.slice(0, islash) + "/" + this.value); });
	
	Event.observe('quicksendlink'+vehIds[i], 'click', function(event) { new Ajax.Updater('VehiclesTable', this.readAttribute('href'), {
		asynchronous:true, 
		evalScripts:true, 
		onLoading:function(request) {Element.show('LoadingDiv');}, 
		onComplete:function(request, json) {Element.hide('LoadingDiv');}, 
		requestHeaders:['X-Update', 'VehiclesTable']
		}); return false; }, false);
}

</SCRIPT>
