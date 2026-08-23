<div id="fullcenter">


<? foreach($mineCategories as $categoryName => $mines): ?>
<div class="localnav">

	<span class="bodytext"><? echo $categoryName; ?>:</span>
	<? 
	foreach($mines as $mineTypeName => $mineTypeId) {
		/*$anchorAtts = array();
		if (isset($selectedMineTypeId) and $mineTypeId == $selectedMineTypeId)
			$anchorAtts = array('class' => 'currentpage');	*/
			
		$anchorAtts['update'] = 'ItemsDiv';
		$anchorAtts['indicator'] = 'LoadingDiv';
		$href = '/mine_types/browse/'.$mineTypeId;
		$jshref = '/mine_types/js_browse/'.$mineTypeId;
		$anchorAtts['complete'] = 'window.history.replaceState(0, "'.$mineTypeName.'", "'.$href.'");';

		echo $ajax->link($mineTypeName, $jshref, $anchorAtts); 
		echo "&nbsp;&nbsp;";
	}?> 
</div>

<? endforeach; ?>


<? 
/*if (isset($accessMarket))
{
	echo "<h3>".$html->link($selectedMineName.' Mine Market', '/mine_types/show_market/'.$selectedMineTypeId);
	echo "</h3>"; 
}*/
?>

<div id="ItemsDiv">
<? require 'views/mine_types/items.inc'; ?>
</div>

</div>
