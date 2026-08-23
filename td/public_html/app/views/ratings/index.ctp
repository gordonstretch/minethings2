
<div id="fullcenter">

	<h3>PvP Ranks</H3>
	<p>Players get daily rewards as shown!  #1-ranked red-orange players get Champions when season ends on 1/01, 5/01, and 9/01. </p>
	
	<?foreach(array(4=>'Red-Orange', 2=>'Green-Blue', 1=>'Yellow') as $class => $name) 
		echo $ajax->link("[$name]", 'js_vehicle_class/'.$class, array(
			'indicator' => 'LoadingDiv',
			'update' => 'RatingsDiv')).' ';
	?>
	
	<div id="RatingsDiv">
	<? include 'ratings.inc'; ?>
	</div>

	<div style="clear:left">

		<BR>
	<p>Players earn ranks by winning in vehicle/ship combat.  Each vehicle/ship has its own ranking determined by the ranks of the vehicles/ships they faced.  A player's highest-ranked vehicle/ship determines the color of the player rank that you see here.  The number of vehicles/ships at that same color determines the rank within that color tier.  Ties are won by the player with the most melds.  If still tied, then it's won by the player newer to the server.  All vehicle and player rankings are reset when the season ends.</p>
	
</div>
