<?
function DisplayRank($ratings, $rank, $rewards, $html)
{
	$rankRank = 1;
	foreach($ratings as $r)
	{
		echo '<div>';
		echo '<div style="text-align:right; float:left; padding-right:3px; width: 20px">'.$rankRank.'.</div>';
		echo $html->image($rank->ImagePath($r['Tier']['rank'], $r['Rating']['vehicle_count']), array('class' => 'rankimage'));//array('width' => 9, 'height' => 14, 'style' => 'margin-right: 3px'));
		echo $html->link($r['Miner']['name'], '/miners/profile/'.$r['Miner']['name']);
		echo ' ('.$r['Miner']['meld_count'].') ';
		
		$searchRank = $rankRank;
		foreach ($rewards as $set)
		{
			if ($searchRank <= $set[0])
			{
				echo $html->image($set[2], array('title' => 'reward for this rank'));
				break;
			}
			$searchRank -= $set[0];
		}
			
		echo '</div>';
		$rankRank++;
	}

}
?>

<style>
img.rankimage {
	width: 9px;
	height: 14px;
	margin-right: 3px;
	}
</style>

<div style="float:left">
	<h2>Land Ranks</h2>
	<? DisplayRank($landRatings, $rank, $rewards, $html); ?>		
</div>

<div style="float:left">
	<h2>Sea Ranks</h2>
	<? DisplayRank($seaRatings, $rank, $rewards, $html); ?>
</div>
