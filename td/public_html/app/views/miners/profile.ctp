	<? echo $html->css($profileCSS); ?>
	<!--Content Column-->
	<!-- Profile Content -->
	<div class="profile_wrapper">
		<!-- User Avatar -->
		<div class="profile_avatar">
			<? echo $html->image($profileImage); ?>
			<? if ($isOwner): ?>
			<div class="avatar_change">
				<? echo $html->link('Change Avatar', '/miners/edit_avatar', array(
					'class' => 'lightview', 
					'rel' => 'iframe', 
					'title' => ' :: :: width: 825, height: 305',
					)); ?>
			</div>
			<? endif ?>
		</div>
		<!-- User Information -->
		<div class="profile_userInfo">
			<!-- User Line - contains username and user online status -->
			<div class="profile_userLine">
				<? if (isset($tierRank)) 
					{
					echo '<div style="display:inline;">';
					echo $rank->ImageLink($tierRank, $vehicleCount);
					echo '</div>';
					} ?>
				<span class="profile_username">
				<!-- User username -->					<? echo $owner['name']; ?> (<? echo $owner['meld_count'];?>)
				</span>
				<? if ($isAdministrator) echo $html->link('admin', '/admins/view_miner/'.$owner['name']); ?>
				<span class="profile_userOnline">
				<!-- User online status -->					<? if ($online) echo '(online)'; ?>
				</span>
			</div>

			<div style="float:right; width:170px;">
			<?
			foreach($mineIcons as $i)
				echo $html->image($i, array('style'=>'margin:2px;'));
			?>
			</div>

			<!-- Profession line - contains user profession -->
			<div class="profile_professionLine">
				<span class="profile_profession">
				<? if ($level) echo $level.' '; echo $profession.' from '.$ownerHomeCity; ?>
				</span>
			</div>
			<!-- Description line - contains user description -->
			<div class="profile_descriptionLine">
				<span class="profile_userDescription">
				<!-- User description -->
				<p><? echo $description; ?></p>
				</span>
			</div>

			<? if ($isOwner): ?>
			
				<div class="profile_optionline">
				<? echo $html->link($html->image('icons/icon_profileimage.png', array('style' => 'border-style:none')).' Change Description', '/miners/change_description', array(
					'class' => 'lightview',
					'rel' => 'iframe',
					'title' => ' :: :: width: 600, height: 370',
					'escape' => false,
					)); ?>
				</div>
				
			<? else: ?>
			
				<div class="profile_optionline">
					<!-- Send Message -->
					<? echo $html->link($html->image('icons/icon_message.png', array('style' => 'border-style:none')).' Send Message', '/messages/chat/'.$owner['name'], array('escape' => false)); ?>
				</div>
				
				<div class="profile_optionline">
					<!-- Listing/Bid -->
					<? echo $html->link($html->image('icons/icon_gold.png', array('style' => 'border-style:none')).' Send Gold', '/transfers/index/'.$owner['name'], array('escape' => false)); ?>
				</div>
				
			<? endif; ?>
			
			
			<div class="profile_optionline">
				<!-- Listing/Bid -->
				<? echo $html->link($html->image('icons/icon_listing.png', array('style' => 'border-style:none')).' Listings and Bids', '/miners/market/'.$owner['name'], array('escape' => false)); ?>
			</div>
		</div> <!-- profile_userInfo -->
		<!-- Clear the floats so we can float on the next line -->
		<div class="clear"></div>

		<? include 'inventory.inc'; ?>
		
		<span class="cachenote">next update <? echo $time->timeago($nextUpdate); ?> <? if ($isOwner) echo $html->link('update now', '/miners/clear_cache'); ?></span>
		
		

	</div> <!-- profile wrapper -->
	<div class="clear"></div>
	<!-- profile wrapper -->
