<div id="fullcenter" style="position:relative; ">

<?
if ($atItemLimit)
{
	echo "<font color=red>You are above your inventory limit and cannot recharge your battery.</font><BR>";
	echo "You are still mining and finding new things but you must reduce your thing count to <b>".$itemLimit."</b> or less to get them from your mine.  You currently have ".$thingCount." things, leaving ".($thingCount - $itemLimit)." things to trash.<br><BR>";
	echo "Trash them easily using the ".$html->link('Automated Trash Detector', '/mines/auto_trash').'.<BR><BR>';
	echo "Alternatively, you can visit the ".$html->link("Shop", '/credits/shop')." and purchase an inventory expansion using gold or credits.";
}
?>

<table>
	

<tr>

<td valign=top style="width:455px;">
<table cellpadding=0 cellspacing=0>
<?php
$i = 0;
foreach($mines as $mine):
	echo '<tr>';

	// bot image
	echo '<td>';
	if ($mine['active'])
	{
		$properties = array('alt' => 'Bot with equipment', 'border' => 0 );
		if ($hasAllParts)
			$properties['url'] = '/mine_types/browse/'.$equipmentMineTypeId;
		else
		{
			$properties['ISMAP'] = true;
			$properties['USEMAP'] = '#partsmap';
			echo '<div><b>Click To Buy Bot Parts:</b></div>';
		}
		echo $html->image($mine['equipmentImage'], $properties);
		
		// links to buy bot parts
		if (!$hasAllParts)
		{			
			echo '<div id="partsErrorDiv"></div>';
			echo "\n".'<map NAME="partsmap">';
			foreach($partsNeeded as $p)
				echo "\n\t".'<area SHAPE=RECT COORDS="'.$p['Part']['tagcoords'].'"'
					.' HREF="javascript:void(0)"'
					.' ALT="'.$p['Part']['name'].'"'
					.' OnClick="new Ajax.Updater(\'partsErrorDiv\',
						\'/mines/js_buy_part/'.$p['Part']['name'].'\', 
						{asynchronous:true, evalScripts:true, requestHeaders:[\'X-Update\', \'partsErrorDiv\'], onComplete:function(request, json) {Element.hide(\'LoadingDiv\');}, onLoading:function(request) {Element.show(\'LoadingDiv\');}}); return false;"'
					.'/>';			
			echo "\n".'<area SHAPE=DEFAULT ></map>';			
		}
				
		// show stones	
		if ($i == 0 and $homeCityId == $currentCityId and !$hideStones)
		{
			echo '<div>';
		
			foreach(array_slice($nextStones, 0, 6) as $stone)
			{
				$r = $stone['rarity'];
				$title = $stone['Stone']['name'].': '.$stone['Stone']['description'].'.  1/2 bph.';
				echo $html->link(
					$html->image('icons/stone'.$r.'.png', array(
						'title' => $title,
						'border' => 0,
						'height' => 30,
						'width' => 30,
						'OnClick' => '$("StoneDiv").update("'.$title.'"); return false;',
						)),
					'javascript:void(0);',
					array('escape' => false) );
			}
			if (count($nextStones) > 5)
				print '...';
			echo '</div>';
			echo '<div id="StoneDiv" style="width:200px;font-size:small;"></div>';
		}
	}

	echo '</td>';

	echo '<td>';
	echo '<div style="border-style:ridge; margin-bottom:10px; padding:5px">';

	if ($mine['active'])
		echo '<span style="float:right">'.$mine['priority'].'</span>';
	if ($simplifyMineTag)
		echo $mine['name'].' mine';
	else
		echo $html->link($mine['name'], '/mine_types/browse/'.$mine['mineTypeId'])." mine";
	if ($mine['rental'])
	{
		echo '<BR>';
		if ($mine['isExpired'])
			echo " <font color=red>expired ";
		else
			echo " expires ";
		echo $mine['expire_time'];
		if ($mine['isExpired'])
			echo "</font> ".$html->link('Rent Again', '/credits/shop').' ';
	}
	echo '<div style="margin:2px">';
	if (!$mine['isExpired'] and (!$mine['isTopPriority'] or !$mine['active']))
		echo $html->link('[top]', '/mines/prioritize/'.$mine['id']);
	else if (!$simplifyMineTag)
		echo '[top]';

	echo ' ';

	echo '<span style="float:right">';
	if (!($mine['rental'] and $mine['isExpired']) and $hasAllParts)
		echo $html->link('[explosives]', '/mines/explode_mine/'.$mine['id']);
	else if (!$simplifyMineTag)
		echo '[explosives]';
	echo '</span>';
	echo '</div>';
	
	echo '<div style="padding:2px">'; 
	if ($showExplosivesAndOil)
	{
		if($hasOil and !$mine['isExpired'] and $mine['active'])
			echo $html->link('[oil bot]', '/mines/oil_bot/'.$mine['id']);
		else
			echo '[oil bot]';
	}
	if ($mine['oilExpireTime'])
		echo ' '.$time->timeago($mine['oilExpireTime'], '', '', false);
	echo '</div>';

	if ($hasAllParts)
	{
		echo $form->create("Mine", array('action' =>  'check_mines') );
		echo $form->hidden("Mine.$i.id", array('value' => $mine['id']))."\n";

		if ($mine['hasOre'])
			$alternative = 'mine ore';
		else
			$alternative = 'mine gold';

		$radioString = $form->input("Mine.$i.mine_things", array(
			'legend'=>false, 
			'type'=>'radio', 
			'options'=>array(0 => $alternative, 1 => 'mine things'),
			'value' => $mine['mineThings'] ) );
		$radioString = preg_replace('/(<input type="radio")/i', '$1 onclick="submit()" ', $radioString);	
		if (!$mine['active'])
			$radioString = preg_replace('/(<input type="radio" )/i', '$1 disabled ', $radioString);
		echo $radioString."\n";

		echo $form->end();	
	}


	echo '</div>';

	echo '<div style="text-align:center; font-weight:bold;">';
	echo $mine['miningRate'].' buckets per hour';
	echo '</div>';
	

	if ($isAdministrator) 
	{	
		echo '<div style="font-size:12px;">';
		if ($mine['active'])
			echo "finding: ".date("y/m/d h:ia", $mine['discovery_time']);
		else
			echo "finding: ".intval($mine['discovery_time']/60)." more minutes";
		echo '</div>';


		echo '<div style="font-size:12px;">';
		echo $html->link("Add 1 day ", "/mines/add_hours/".$mine['id']."/24");
		echo $html->link("Add 5 days ", "/mines/add_hours/".$mine['id']."/120");
		echo $html->link("Add 25 days ", "/mines/add_hours/".$mine['id']."/600");
		echo '</div>';
	}

	echo '</td>';


	echo '</tr>';
	$i++;
endforeach;

if ($showEmpties)
	for ($i = 0; $i < $emptySlots; $i++)
	{
		echo $html->tableCells(array(
			$html->image('equipment/botparts/empty.gif', array('border' => 0, 'url' => '/credits/shop'))
			));
	}
	

?>

</table>
</td>

<?
echo '<td valign=top style="width:320px;">';

echo $this->element('findings');
if (count($findings) == 2000)
	echo "<p>(capped at 2000 per click)</p>";

if (!count($findings) and !$atItemLimit and $miningThings)
{
	echo '<table class="things-table" summary="Findings">';
	$suggest = 'Check back in a few hours.';
		
	$cells[] = array("Nothing new.&nbsp;&nbsp;".$suggest);
	echo $html->tableCells($cells, array('class' => 'even'), array('class' => 'odd'));
	echo '</table>';
}

if ($showExplosivesAndOil)
{
	if (isset($cheapestExplosive))
	{
		echo '<BR>';
		echo $html->link($cheapestExplosive['Item']['name'].' only '.$market->commatize($cheapestExplosive['Item']['Marketable']['LimitOrder'][0]['price']).'g', '/items/view/'.$cheapestExplosive['Item']['id']);
		echo '<BR>';
	}
	
	if ($oilPrice)
	{
		echo '<BR>';
		$elementParams = array('marketable' => array('Marketable' => array('id' => $oilMarketableId, 'name' => 'Oil')),
			'price' => $market->commatize($oilPrice),
			'cityId' => $currentCityId,
			'onComplete' => ' if (data.owned == 1) window.location = "/mines/check_mines";');
		echo $this->element('buy_form', $elementParams);
		echo $this->element('buy_button', $elementParams);
		echo '<BR>';
	}
}


$cells = array();
echo '<BR>';

echo $this->element('findings', array('findings' => $pastFindings));

echo '<div id="FindingsListDiv"></div>';

if (count($pastFindings) >= 50)
{
	echo "<div id=\"FindingsLink\">";
	echo $ajax->link('load more findings', '/mines/js_findings/'.$lastFindingId, array(
		'update' => 'FindingsListDiv', 
		'indicator' => 'LoadingDiv',
		'position' => 'bottom', 
		'loaded' => "$('FindingsLink').hide();" )); 
}
?>
</div>



</td>


</tr>                                                                   
</table>


<? if (count($mines) == 0): ?>

You have no mines in this city.

<? endif ?>

</div>


<? if ($animateGold and !$hasAllParts): ?>
<!-- show a js animation of gold moving from the mine to the gold balance -->
<script src="http://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js"></script>
<script src="http://ajax.googleapis.com/ajax/libs/jqueryui/1.11.3/jquery-ui.min.js"></script>
<script>
	var $j = jQuery.noConflict();
	var pos = '340px 0 0 360px';
	var css = { position:'absolute', 'font-weight':'bold', margin:pos, 'z-index':1000 };
	var g = $j('<p>g</p>').css(css).prependTo($j('#wrapper'));
	
	// how many ms does it take to get 0.0001g?
	var tickrate = 1.0 / mtRate * 3600.0 / 10000.0 * 1000.0;
	var anim = function() { 
		g.animate({'margin-left':'+=268', 'margin-top':'-=268'}, {duration:tickrate-10, complete:function() { g.css('margin', pos); } });
	};
	anim();
	setInterval(anim, tickrate);
</script>
<? endif; ?>
